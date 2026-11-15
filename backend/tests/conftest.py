"""Общие фикстуры. Интеграционные тесты работают с отдельной тестовой БД
(TEST_DATABASE_URL), схема создаётся настоящими миграциями Alembic."""

import os
from datetime import UTC, datetime, timedelta

os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", "postgresql+psycopg://app:app@localhost:5432/booking_test")
os.environ["UPLOAD_DIR"] = "/tmp/meetspace-test-uploads"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Amenity, Location, Role, Room, User  # noqa: E402
from app.services.bookings import OFFICE_TZ  # noqa: E402

TABLES = (
    "audit_logs, bookings, refresh_tokens, password_reset_tokens, "
    "room_photos, room_amenities, rooms, amenities, locations, users"
)


@pytest.fixture(scope="session", autouse=True)
def migrate():
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def clean_db():
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))
    yield


@pytest.fixture
def db():
    s = SessionLocal()
    yield s
    s.close()


@pytest.fixture
def client():
    return TestClient(app)


PASSWORD = "Password123"


def make_user(db, email: str, role: Role) -> User:
    u = User(email=email, password_hash=hash_password(PASSWORD), full_name=email.split("@")[0], role=role)
    db.add(u)
    db.commit()
    return u


def auth_headers(client, email: str) -> dict:
    r = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def users(db):
    return {
        "admin": make_user(db, "admin@test.ru", Role.admin),
        "employee": make_user(db, "employee@test.ru", Role.employee),
        "employee2": make_user(db, "employee2@test.ru", Role.employee),
        "guest": make_user(db, "guest@test.ru", Role.guest),
    }


@pytest.fixture
def headers(client, users):
    return {k: auth_headers(client, u.email) for k, u in users.items()}


@pytest.fixture
def room(db):
    loc = Location(name="Офис", address="Москва")
    am = Amenity(name="Проектор")
    db.add_all([loc, am])
    db.flush()
    r = Room(location_id=loc.id, name="Альфа", capacity=6, floor=2, amenities=[am])
    db.add(r)
    db.commit()
    return r


def future_slot(days: int = 1, hour: int = 10, hours: int = 1) -> tuple[str, str]:
    """Слот в будущем по московскому времени, в формате ISO."""
    day = datetime.now(OFFICE_TZ).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=days)
    start = day.replace(hour=hour)
    end = start + timedelta(hours=hours)
    return start.astimezone(UTC).isoformat(), end.astimezone(UTC).isoformat()
