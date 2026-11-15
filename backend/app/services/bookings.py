"""Бизнес-логика бронирования — главная «изюминка» проекта.

Правила:
1. Бронировать можно только активный зал.
2. Нельзя бронировать в прошлом.
3. Время кратно 30 минутам, в рабочие часы (08:00–22:00 по времени зала).
4. Длительность от 30 минут до 4 часов.
5. Участников не больше вместимости зала.
6. Брони одного зала не пересекаются (проверка в сервисе + ограничение EXCLUDE в БД).
7. Гость создаёт заявку (pending) — её подтверждает админ. Сотрудник и админ — сразу confirmed.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from app.models import Booking, BookingStatus, Role, User
from app.repositories import BookingRepo, RoomRepo, paginate
from app.schemas import BookingIn
from app.services.audit import log_action

# Часовой пояс офиса — по нему считаются рабочие часы
OFFICE_TZ = ZoneInfo("Europe/Moscow")


def validate_booking_time(start: datetime, end: datetime, now: datetime | None = None) -> None:
    """Проверка правил 2–4. Вынесена в функцию, чтобы покрыть unit-тестами."""
    now = now or datetime.now(UTC)
    if end <= start:
        raise ValidationFailed("Время окончания должно быть позже начала")
    if start < now:
        raise ValidationFailed("Нельзя забронировать зал в прошлом")

    for t in (start, end):
        if t.second or t.microsecond or t.minute % settings.slot_minutes:
            raise ValidationFailed(f"Время должно быть кратно {settings.slot_minutes} минутам")

    duration = end - start
    if duration > timedelta(hours=settings.max_booking_hours):
        raise ValidationFailed(f"Максимальная длительность брони — {settings.max_booking_hours} ч")

    local_start, local_end = start.astimezone(OFFICE_TZ), end.astimezone(OFFICE_TZ)
    if local_start.date() != local_end.date():
        raise ValidationFailed("Бронь должна начинаться и заканчиваться в один день")
    day_open = local_start.replace(hour=settings.work_day_start_hour, minute=0)
    day_close = local_start.replace(hour=settings.work_day_end_hour, minute=0)
    if local_start < day_open or local_end > day_close:
        raise ValidationFailed(f"Залы работают с {settings.work_day_start_hour}:00 до {settings.work_day_end_hour}:00")


def initial_status(role: Role) -> BookingStatus:
    return BookingStatus.pending if role == Role.guest else BookingStatus.confirmed


def can_change_status(actor: User, booking: Booking, new: BookingStatus) -> bool:
    """Кто какой статус может поставить."""
    if actor.role == Role.admin:
        allowed = {
            BookingStatus.pending: {BookingStatus.confirmed, BookingStatus.rejected, BookingStatus.cancelled},
            BookingStatus.confirmed: {BookingStatus.cancelled},
        }
        return new in allowed.get(booking.status, set())
    # владелец может только отменить свою активную бронь
    return (
        booking.user_id == actor.id
        and new == BookingStatus.cancelled
        and booking.status in (BookingStatus.pending, BookingStatus.confirmed)
    )


class BookingService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = BookingRepo(db)
        self.rooms = RoomRepo(db)

    def get_visible(self, actor: User, booking_id: int) -> Booking:
        booking = self.repo.get(booking_id)
        # чужую бронь не показываем: отвечаем 404, чтобы не раскрывать её существование
        if booking is None or (actor.role != Role.admin and booking.user_id != actor.id):
            raise NotFound("Бронь не найдена")
        return booking

    def create(self, actor: User, data: BookingIn) -> Booking:
        room = self.rooms.get(data.room_id)
        if room is None or not room.is_active:
            raise NotFound("Зал не найден или недоступен")
        validate_booking_time(data.start_at, data.end_at)
        if data.attendees > room.capacity:
            raise ValidationFailed(f"Вместимость зала — {room.capacity} человек")
        if self.repo.has_overlap(room.id, data.start_at, data.end_at):
            raise Conflict("Это время уже занято. Выберите другой слот")

        booking = Booking(
            room_id=room.id,
            user_id=actor.id,
            title=data.title.strip(),
            start_at=data.start_at,
            end_at=data.end_at,
            attendees=data.attendees,
            status=initial_status(actor.role),
        )
        self.db.add(booking)
        try:
            self.db.flush()
        except IntegrityError:
            # гонка: два запроса одновременно — сработало ограничение EXCLUDE в БД
            self.db.rollback()
            raise Conflict("Это время уже занято. Выберите другой слот") from None
        log_action(self.db, actor, "booking.create", "booking", booking.id, room=room.name, status=booking.status.value)
        self.db.commit()
        return self.repo.get(booking.id)

    def change_status(self, actor: User, booking_id: int, new: BookingStatus) -> Booking:
        booking = self.get_visible(actor, booking_id)
        if not can_change_status(actor, booking, new):
            raise Forbidden("Нельзя перевести бронь в этот статус")
        if new == BookingStatus.confirmed and self.repo.has_overlap(
            booking.room_id, booking.start_at, booking.end_at, exclude_id=booking.id
        ):
            raise Conflict("На это время уже есть другая бронь")
        old = booking.status
        booking.status = new
        log_action(self.db, actor, "booking.status", "booking", booking.id, old=old.value, new=new.value)
        self.db.commit()
        return self.repo.get(booking.id)

    def list(self, actor: User, *, mine: bool, page: int, size: int, **filters):
        user_id = actor.id if (mine or actor.role != Role.admin) else filters.pop("user_id", None)
        filters.pop("user_id", None)
        stmt = self.repo.filtered(user_id=user_id, **filters)
        return paginate(self.db, stmt, page, size)

    def all_for_export(self, actor: User, **filters) -> list[Booking]:
        user_id = None if actor.role == Role.admin else actor.id
        stmt = self.repo.filtered(user_id=user_id, **filters)
        return list(self.db.scalars(stmt.limit(5000)).unique().all())
