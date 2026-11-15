"""Репозитории: только работа с БД (запросы), без бизнес-правил."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Amenity,
    AuditLog,
    Booking,
    BookingStatus,
    Location,
    Room,
    User,
    room_amenities,
)

ACTIVE_STATUSES = (BookingStatus.pending, BookingStatus.confirmed)


def paginate(db: Session, stmt: Select, page: int, size: int) -> tuple[list, int]:
    """Возвращает (элементы страницы, общее количество)."""
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    items = db.scalars(stmt.offset((page - 1) * size).limit(size)).unique().all()
    return list(items), total or 0


def _sort(stmt: Select, columns: dict, sort: str | None, default):
    """sort='name' — по возрастанию, sort='-name' — по убыванию."""
    if not sort:
        return stmt.order_by(default)
    desc = sort.startswith("-")
    col = columns.get(sort.lstrip("-"))
    if col is None:
        return stmt.order_by(default)
    return stmt.order_by(col.desc() if desc else col.asc(), default)


# ---------- Users ----------
class UserRepo:
    SORT = {"email": User.email, "full_name": User.full_name, "created_at": User.created_at}

    def __init__(self, db: Session):
        self.db = db

    def by_email(self, email: str) -> User | None:
        return self.db.scalar(select(User).where(func.lower(User.email) == email.lower()))

    def list(self, search, role, sort, page, size):
        stmt = select(User)
        if search:
            like = f"%{search.lower()}%"
            stmt = stmt.where(or_(func.lower(User.email).like(like), func.lower(User.full_name).like(like)))
        if role:
            stmt = stmt.where(User.role == role)
        stmt = _sort(stmt, self.SORT, sort, User.id)
        return paginate(self.db, stmt, page, size)


# ---------- Rooms ----------
class RoomRepo:
    SORT = {"name": Room.name, "capacity": Room.capacity, "floor": Room.floor, "created_at": Room.created_at}

    def __init__(self, db: Session):
        self.db = db

    def _base(self) -> Select:
        return select(Room).options(
            selectinload(Room.location), selectinload(Room.amenities), selectinload(Room.photos)
        )

    def get(self, room_id: int) -> Room | None:
        return self.db.scalar(self._base().where(Room.id == room_id))

    def list(self, *, search, location_id, min_capacity, amenity_ids, only_active, sort, page, size):
        stmt = self._base()
        if search:
            like = f"%{search.lower()}%"
            stmt = stmt.where(or_(func.lower(Room.name).like(like), func.lower(Room.description).like(like)))
        if location_id:
            stmt = stmt.where(Room.location_id == location_id)
        if min_capacity:
            stmt = stmt.where(Room.capacity >= min_capacity)
        if only_active:
            stmt = stmt.where(Room.is_active.is_(True))
        for aid in amenity_ids or []:
            # зал должен иметь КАЖДОЕ из выбранных удобств
            stmt = stmt.where(Room.id.in_(select(room_amenities.c.room_id).where(room_amenities.c.amenity_id == aid)))
        stmt = _sort(stmt, self.SORT, sort, Room.id)
        return paginate(self.db, stmt, page, size)

    def amenities_by_ids(self, ids: list[int]) -> list[Amenity]:
        if not ids:
            return []
        return list(self.db.scalars(select(Amenity).where(Amenity.id.in_(ids))).all())

    def location(self, location_id: int) -> Location | None:
        return self.db.get(Location, location_id)


# ---------- Bookings ----------
class BookingRepo:
    SORT = {
        "start_at": Booking.start_at,
        "created_at": Booking.created_at,
        "title": Booking.title,
        "status": Booking.status,
    }

    def __init__(self, db: Session):
        self.db = db

    def _base(self) -> Select:
        return select(Booking).options(selectinload(Booking.room), selectinload(Booking.user))

    def get(self, booking_id: int) -> Booking | None:
        return self.db.scalar(self._base().where(Booking.id == booking_id))

    def has_overlap(self, room_id: int, start: datetime, end: datetime, exclude_id: int | None = None) -> bool:
        stmt = select(Booking.id).where(
            Booking.room_id == room_id,
            Booking.status.in_(ACTIVE_STATUSES),
            and_(Booking.start_at < end, Booking.end_at > start),
        )
        if exclude_id:
            stmt = stmt.where(Booking.id != exclude_id)
        return self.db.scalar(stmt.limit(1)) is not None

    def busy_slots(self, room_id: int, day_start: datetime, day_end: datetime) -> list[Booking]:
        stmt = (
            select(Booking)
            .where(
                Booking.room_id == room_id,
                Booking.status.in_(ACTIVE_STATUSES),
                Booking.start_at < day_end,
                Booking.end_at > day_start,
            )
            .order_by(Booking.start_at)
        )
        return list(self.db.scalars(stmt).all())

    def filtered(self, *, user_id, room_id, status, search, date_from, date_to, sort) -> Select:
        stmt = self._base()
        if user_id:
            stmt = stmt.where(Booking.user_id == user_id)
        if room_id:
            stmt = stmt.where(Booking.room_id == room_id)
        if status:
            stmt = stmt.where(Booking.status == status)
        if search:
            stmt = stmt.where(func.lower(Booking.title).like(f"%{search.lower()}%"))
        if date_from:
            stmt = stmt.where(Booking.end_at >= date_from)
        if date_to:
            stmt = stmt.where(Booking.start_at <= date_to)
        return _sort(stmt, self.SORT, sort or "-start_at", Booking.id)


# ---------- Audit ----------
class AuditRepo:
    def __init__(self, db: Session):
        self.db = db

    def list(self, action, user_id, page, size):
        stmt = select(AuditLog).options(selectinload(AuditLog.user))
        if action:
            stmt = stmt.where(AuditLog.action == action)
        if user_id:
            stmt = stmt.where(AuditLog.user_id == user_id)
        stmt = stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        return paginate(self.db, stmt, page, size)
