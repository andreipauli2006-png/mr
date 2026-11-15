from datetime import datetime

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.db import get_db
from app.models import BookingStatus, User
from app.schemas import BookingIn, BookingOut, BookingStatusIn, DashboardOut, Page
from app.services import reports
from app.services.bookings import BookingService

router = APIRouter(tags=["Бронирования"])


@router.post("/bookings", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
def create_booking(data: BookingIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Гость создаёт заявку (pending), сотрудник и админ — сразу подтверждённую бронь."""
    return BookingService(db).create(user, data)


@router.get("/bookings", response_model=Page[BookingOut])
def list_bookings(
    mine: bool = Query(True, description="Только мои брони. Админ может передать false"),
    room_id: int | None = None,
    user_id: int | None = None,
    status_: BookingStatus | None = Query(None, alias="status"),
    search: str | None = Query(None, max_length=100),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    sort: str | None = Query(None, description="start_at | created_at | title | status, «-» — по убыванию"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items, total = BookingService(db).list(
        user,
        mine=mine,
        page=page,
        size=size,
        user_id=user_id,
        room_id=room_id,
        status=status_,
        search=search,
        date_from=date_from,
        date_to=date_to,
        sort=sort,
    )
    return Page(items=items, total=total, page=page, size=size)


@router.get("/bookings/export.xlsx", response_class=Response)
def export_bookings(
    status_: BookingStatus | None = Query(None, alias="status"),
    room_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Экспорт в Excel. Админ получает все брони, остальные — только свои."""
    items = BookingService(db).all_for_export(
        user, room_id=room_id, status=status_, search=None, date_from=date_from, date_to=date_to, sort="start_at"
    )
    return Response(
        content=reports.bookings_to_xlsx(items),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="bookings.xlsx"'},
    )


@router.get("/bookings/{booking_id}", response_model=BookingOut)
def get_booking(booking_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return BookingService(db).get_visible(user, booking_id)


@router.patch("/bookings/{booking_id}/status", response_model=BookingOut)
def change_status(
    booking_id: int,
    data: BookingStatusIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Владелец может отменить свою бронь. Админ — подтвердить, отклонить или отменить любую."""
    return BookingService(db).change_status(user, booking_id, data.status)


@router.get("/admin/dashboard", response_model=DashboardOut, tags=["Администрирование"])
def dashboard(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return reports.dashboard(db)
