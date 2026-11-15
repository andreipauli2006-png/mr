"""Pydantic-схемы: что API принимает и что отдаёт."""

from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models import BookingStatus, Role

T = TypeVar("T")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int


# ---------- Auth ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    full_name: str = Field(min_length=2, max_length=120)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isdigit() for c in v) or not any(c.isalpha() for c in v):
            raise ValueError("Пароль должен содержать буквы и цифры")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=72)


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8, max_length=72)


# ---------- Users ----------
class UserOut(ORM):
    id: int
    email: EmailStr
    full_name: str
    role: Role
    is_blocked: bool
    created_at: datetime


class ProfileUpdateIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)


class AdminUserUpdateIn(BaseModel):
    role: Role | None = None
    is_blocked: bool | None = None


# ---------- Locations / amenities ----------
class LocationIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    address: str = Field(min_length=3, max_length=255)


class LocationOut(ORM):
    id: int
    name: str
    address: str


class AmenityIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)


class AmenityOut(ORM):
    id: int
    name: str


# ---------- Rooms ----------
class RoomPhotoOut(ORM):
    id: int
    file_name: str
    url: str = ""


class RoomIn(BaseModel):
    location_id: int
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=2000)
    capacity: int = Field(ge=1, le=500)
    floor: int = Field(default=1, ge=-5, le=200)
    is_active: bool = True
    amenity_ids: list[int] = []


class RoomOut(ORM):
    id: int
    name: str
    description: str
    capacity: int
    floor: int
    is_active: bool
    location: LocationOut
    amenities: list[AmenityOut]
    photos: list[RoomPhotoOut]


# ---------- Bookings ----------
class BookingIn(BaseModel):
    room_id: int
    title: str = Field(min_length=2, max_length=200)
    start_at: datetime
    end_at: datetime
    attendees: int = Field(default=1, ge=1, le=500)

    @model_validator(mode="after")
    def check_times(self):
        if self.start_at.tzinfo is None or self.end_at.tzinfo is None:
            raise ValueError("Время должно быть с часовым поясом (ISO 8601)")
        if self.end_at <= self.start_at:
            raise ValueError("Время окончания должно быть позже начала")
        return self


class BookingStatusIn(BaseModel):
    status: BookingStatus


class BookingUserOut(ORM):
    id: int
    full_name: str
    email: EmailStr


class BookingRoomOut(ORM):
    id: int
    name: str


class BookingOut(ORM):
    id: int
    title: str
    start_at: datetime
    end_at: datetime
    attendees: int
    status: BookingStatus
    created_at: datetime
    room: BookingRoomOut
    user: BookingUserOut


class SlotOut(BaseModel):
    """Занятый интервал в календаре зала (без личных данных — видят все)."""

    start_at: datetime
    end_at: datetime
    status: BookingStatus
    mine: bool = False


# ---------- Audit / stats ----------
class AuditOut(ORM):
    id: int
    action: str
    entity: str
    entity_id: int | None
    details: dict
    created_at: datetime
    user: BookingUserOut | None


class DayCount(BaseModel):
    day: str
    count: int


class RoomCount(BaseModel):
    room: str
    count: int


class DashboardOut(BaseModel):
    total_rooms: int
    total_users: int
    bookings_today: int
    pending_count: int
    by_day: list[DayCount]
    top_rooms: list[RoomCount]
