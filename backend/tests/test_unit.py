"""Unit-тесты бизнес-логики (без HTTP)."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.core.errors import ValidationFailed
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.models import BookingStatus, Role
from app.schemas import BookingIn, RegisterIn
from app.services.bookings import OFFICE_TZ, can_change_status, initial_status, validate_booking_time
from app.services.rooms import validate_image

NOW = datetime(2026, 11, 16, 7, 0, tzinfo=UTC)  # 10:00 по Москве


def msk(day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 11, day, hour, minute, tzinfo=OFFICE_TZ)


# ---------- правила времени брони ----------
class TestValidateBookingTime:
    def test_ok(self):
        validate_booking_time(msk(17, 10), msk(17, 11, 30), now=NOW)

    def test_end_before_start(self):
        with pytest.raises(ValidationFailed, match="позже начала"):
            validate_booking_time(msk(17, 11), msk(17, 10), now=NOW)

    def test_in_past(self):
        with pytest.raises(ValidationFailed, match="прошлом"):
            validate_booking_time(msk(15, 10), msk(15, 11), now=NOW)

    def test_not_multiple_of_slot(self):
        with pytest.raises(ValidationFailed, match="кратно"):
            validate_booking_time(msk(17, 10, 15), msk(17, 11), now=NOW)

    def test_too_long(self):
        with pytest.raises(ValidationFailed, match="Максимальная"):
            validate_booking_time(msk(17, 9), msk(17, 14), now=NOW)

    def test_before_opening(self):
        with pytest.raises(ValidationFailed, match="работают"):
            validate_booking_time(msk(17, 7), msk(17, 8), now=NOW)

    def test_after_closing(self):
        with pytest.raises(ValidationFailed, match="работают"):
            validate_booking_time(msk(17, 21), msk(17, 22, 30), now=NOW)

    def test_ends_exactly_at_closing(self):
        validate_booking_time(msk(17, 20), msk(17, 22), now=NOW)

    def test_crosses_midnight(self):
        with pytest.raises(ValidationFailed):
            validate_booking_time(msk(17, 21), msk(18, 0), now=NOW)


# ---------- статусы и роли ----------
def test_initial_status_by_role():
    assert initial_status(Role.guest) == BookingStatus.pending
    assert initial_status(Role.employee) == BookingStatus.confirmed
    assert initial_status(Role.admin) == BookingStatus.confirmed


def _user(uid, role):
    return SimpleNamespace(id=uid, role=role)


def _booking(owner, status):
    return SimpleNamespace(user_id=owner, status=status)


@pytest.mark.parametrize(
    "actor, booking, new, expected",
    [
        (_user(1, Role.employee), _booking(1, BookingStatus.confirmed), BookingStatus.cancelled, True),
        (_user(1, Role.employee), _booking(2, BookingStatus.confirmed), BookingStatus.cancelled, False),
        (_user(1, Role.employee), _booking(1, BookingStatus.pending), BookingStatus.confirmed, False),
        (_user(1, Role.guest), _booking(1, BookingStatus.cancelled), BookingStatus.cancelled, False),
        (_user(9, Role.admin), _booking(1, BookingStatus.pending), BookingStatus.confirmed, True),
        (_user(9, Role.admin), _booking(1, BookingStatus.pending), BookingStatus.rejected, True),
        (_user(9, Role.admin), _booking(1, BookingStatus.confirmed), BookingStatus.rejected, False),
        (_user(9, Role.admin), _booking(1, BookingStatus.cancelled), BookingStatus.confirmed, False),
    ],
)
def test_can_change_status(actor, booking, new, expected):
    assert can_change_status(actor, booking, new) is expected


# ---------- файлы ----------
PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 100


def test_validate_image_ok():
    assert validate_image("image/png", PNG) == ".png"


def test_validate_image_wrong_type():
    with pytest.raises(ValidationFailed, match="только изображения"):
        validate_image("application/pdf", b"%PDF")


def test_validate_image_fake_content():
    with pytest.raises(ValidationFailed, match="не совпадает"):
        validate_image("image/png", b"<script>alert(1)</script>")


def test_validate_image_too_big():
    with pytest.raises(ValidationFailed, match="МБ"):
        validate_image("image/png", b"\x89PNG\r\n\x1a\n" + b"0" * (6 * 1024 * 1024))


def test_validate_image_empty():
    with pytest.raises(ValidationFailed, match="пустой"):
        validate_image("image/png", b"")


# ---------- безопасность ----------
def test_password_hash_roundtrip():
    h = hash_password("Secret123")
    assert h != "Secret123"
    assert verify_password("Secret123", h)
    assert not verify_password("wrong", h)


def test_access_token_roundtrip():
    payload = decode_access_token(create_access_token(5, "admin"))
    assert payload["sub"] == "5" and payload["role"] == "admin"


def test_hash_token_is_stable():
    assert hash_token("abc") == hash_token("abc") != hash_token("abd")


# ---------- схемы ----------
def test_register_requires_letters_and_digits():
    with pytest.raises(ValidationError):
        RegisterIn(email="a@b.ru", password="onlyletters", full_name="Тест")


def test_booking_schema_rejects_naive_datetime():
    with pytest.raises(ValidationError):
        BookingIn(room_id=1, title="t" * 3, start_at=datetime(2026, 1, 1, 10), end_at=datetime(2026, 1, 1, 11))


def test_booking_schema_end_after_start():
    start = datetime.now(UTC)
    with pytest.raises(ValidationError):
        BookingIn(room_id=1, title="abc", start_at=start, end_at=start - timedelta(hours=1))
