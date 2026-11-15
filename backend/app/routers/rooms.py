from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_optional_user, require_admin
from app.core.errors import Conflict, NotFound
from app.db import get_db
from app.models import Amenity, Location, Role, User
from app.repositories import BookingRepo, RoomRepo
from app.schemas import (
    AmenityIn,
    AmenityOut,
    LocationIn,
    LocationOut,
    Page,
    RoomIn,
    RoomOut,
    RoomPhotoOut,
    SlotOut,
)
from app.services.audit import log_action
from app.services.bookings import OFFICE_TZ
from app.services.rooms import RoomService

router = APIRouter(tags=["Залы"])


def photo_url(file_name: str) -> str:
    return f"/uploads/{file_name}"


def room_out(room) -> RoomOut:
    out = RoomOut.model_validate(room)
    for p in out.photos:
        p.url = photo_url(p.file_name)
    return out


# ---------- Залы: просмотр доступен всем, даже без входа ----------
@router.get("/rooms", response_model=Page[RoomOut])
def list_rooms(
    search: str | None = Query(None, max_length=100),
    location_id: int | None = None,
    min_capacity: int | None = Query(None, ge=1),
    amenity_ids: list[int] = Query([]),
    include_inactive: bool = False,
    sort: str | None = Query(None, description="name | capacity | floor | created_at, «-» — по убыванию"),
    page: int = Query(1, ge=1),
    size: int = Query(12, ge=1, le=100),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    only_active = not (include_inactive and user and user.role == Role.admin)
    items, total = RoomRepo(db).list(
        search=search,
        location_id=location_id,
        min_capacity=min_capacity,
        amenity_ids=amenity_ids,
        only_active=only_active,
        sort=sort,
        page=page,
        size=size,
    )
    return Page(items=[room_out(r) for r in items], total=total, page=page, size=size)


@router.get("/rooms/{room_id}", response_model=RoomOut)
def get_room(room_id: int, user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    is_admin = bool(user and user.role == Role.admin)
    return room_out(RoomService(db).get(room_id, include_inactive=is_admin))


@router.get("/rooms/{room_id}/slots", response_model=list[SlotOut])
def room_slots(
    room_id: int,
    day: date,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Занятые интервалы зала на выбранный день — для календаря."""
    RoomService(db).get(room_id)
    start = datetime.combine(day, time.min, tzinfo=OFFICE_TZ)
    end = start + timedelta(days=1)
    return [
        SlotOut(start_at=b.start_at, end_at=b.end_at, status=b.status, mine=bool(user and b.user_id == user.id))
        for b in BookingRepo(db).busy_slots(room_id, start, end)
    ]


@router.post("/rooms", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
def create_room(data: RoomIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return room_out(RoomService(db).create(admin, data))


@router.put("/rooms/{room_id}", response_model=RoomOut)
def update_room(room_id: int, data: RoomIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return room_out(RoomService(db).update(admin, room_id, data))


@router.delete("/rooms/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_room(room_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    RoomService(db).delete(admin, room_id)


@router.post("/rooms/{room_id}/photos", response_model=RoomPhotoOut, status_code=status.HTTP_201_CREATED)
async def upload_photo(
    room_id: int,
    file: UploadFile = File(..., description="JPG / PNG / WEBP, до 5 МБ"),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    photo = await RoomService(db).add_photo(admin, room_id, file)
    out = RoomPhotoOut.model_validate(photo)
    out.url = photo_url(photo.file_name)
    return out


@router.delete("/rooms/{room_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(room_id: int, photo_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    RoomService(db).delete_photo(admin, room_id, photo_id)


# ---------- Справочники: локации и удобства ----------
@router.get("/locations", response_model=list[LocationOut], tags=["Справочники"])
def list_locations(db: Session = Depends(get_db)):
    return db.scalars(select(Location).order_by(Location.name)).all()


@router.post("/locations", response_model=LocationOut, status_code=201, tags=["Справочники"])
def create_location(data: LocationIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    loc = Location(**data.model_dump())
    db.add(loc)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise Conflict("Локация с таким названием уже есть") from None
    log_action(db, admin, "location.create", "location", loc.id, name=loc.name)
    db.commit()
    return loc


@router.delete("/locations/{location_id}", status_code=204, tags=["Справочники"])
def delete_location(location_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    loc = db.get(Location, location_id)
    if loc is None:
        raise NotFound("Локация не найдена")
    db.delete(loc)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict("В локации есть залы — сначала удалите или перенесите их") from None


@router.get("/amenities", response_model=list[AmenityOut], tags=["Справочники"])
def list_amenities(db: Session = Depends(get_db)):
    return db.scalars(select(Amenity).order_by(Amenity.name)).all()


@router.post("/amenities", response_model=AmenityOut, status_code=201, tags=["Справочники"])
def create_amenity(data: AmenityIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    am = Amenity(name=data.name.strip())
    db.add(am)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict("Такое удобство уже есть") from None
    return am
