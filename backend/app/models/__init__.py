"""ORM-модели. Схема БД в 3НФ, 10 таблиц (см. docs/er-diagram.md)."""

import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Role(str, enum.Enum):
    guest = "guest"  # может смотреть залы и оставлять заявки (требуют подтверждения)
    employee = "employee"  # бронирует сразу, без подтверждения
    admin = "admin"  # управляет залами, пользователями, подтверждает заявки


class BookingStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    rejected = "rejected"
    cancelled = "cancelled"


# Связь многие-ко-многим: зал <-> удобство (проектор, доска и т.д.)
room_amenities = Table(
    "room_amenities",
    Base.metadata,
    Column("room_id", ForeignKey("rooms.id", ondelete="CASCADE"), primary_key=True),
    Column("amenity_id", ForeignKey("amenities.id", ondelete="CASCADE"), primary_key=True),
)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(120), index=True)
    role: Mapped[Role] = mapped_column(Enum(Role, name="user_role"), default=Role.guest)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)

    bookings: Mapped[list["Booking"]] = relationship(back_populates="user")


class Location(TimestampMixin, Base):
    """Здание / коворкинг, в котором находятся залы."""

    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    address: Mapped[str] = mapped_column(String(255))

    rooms: Mapped[list["Room"]] = relationship(back_populates="location")


class Amenity(Base):
    __tablename__ = "amenities"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)


class Room(TimestampMixin, Base):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="RESTRICT"), index=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    capacity: Mapped[int] = mapped_column(Integer, index=True)
    floor: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    location: Mapped[Location] = relationship(back_populates="rooms")
    amenities: Mapped[list[Amenity]] = relationship(secondary=room_amenities)
    photos: Mapped[list["RoomPhoto"]] = relationship(back_populates="room", cascade="all, delete-orphan")


class RoomPhoto(TimestampMixin, Base):
    __tablename__ = "room_photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    file_name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(50))
    size_bytes: Mapped[int] = mapped_column(Integer)

    room: Mapped[Room] = relationship(back_populates="photos")


class Booking(TimestampMixin, Base):
    """Бронь зала. Пересечения запрещены ограничением EXCLUDE в БД (см. миграцию)."""

    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200), index=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attendees: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[BookingStatus] = mapped_column(
        Enum(BookingStatus, name="booking_status"), default=BookingStatus.pending, index=True
    )

    room: Mapped[Room] = relationship()
    user: Mapped[User] = relationship(back_populates="bookings")


class RefreshToken(TimestampMixin, Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


class PasswordResetToken(TimestampMixin, Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class AuditLog(TimestampMixin, Base):
    """Журнал действий пользователей (доп. функционал 3.2)."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True)
    action: Mapped[str] = mapped_column(String(60), index=True)
    entity: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    details: Mapped[dict] = mapped_column(JSONB, default=dict)

    user: Mapped[User | None] = relationship()
