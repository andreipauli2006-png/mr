"""Статистика для дашборда и экспорт броней в Excel (доп. функционал 3.2)."""

from datetime import UTC, datetime, timedelta
from io import BytesIO

from openpyxl import Workbook
from openpyxl.styles import Font
from sqlalchemy import Date, cast, func, select
from sqlalchemy.orm import Session

from app.models import Booking, BookingStatus, Room, User
from app.repositories import ACTIVE_STATUSES
from app.schemas import DashboardOut, DayCount, RoomCount
from app.services.bookings import OFFICE_TZ

STATUS_RU = {
    BookingStatus.pending: "Ожидает",
    BookingStatus.confirmed: "Подтверждена",
    BookingStatus.rejected: "Отклонена",
    BookingStatus.cancelled: "Отменена",
}


def dashboard(db: Session, days: int = 14) -> DashboardOut:
    now = datetime.now(OFFICE_TZ)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    since = today_start - timedelta(days=days - 1)

    local_day = cast(func.timezone("Europe/Moscow", Booking.start_at), Date)
    rows = db.execute(
        select(local_day.label("day"), func.count())
        .where(Booking.start_at >= since, Booking.status.in_(ACTIVE_STATUSES))
        .group_by("day")
    ).all()
    counts = {r.day: r[1] for r in rows}
    by_day = [
        DayCount(
            day=(since + timedelta(days=i)).date().isoformat(), count=counts.get((since + timedelta(days=i)).date(), 0)
        )
        for i in range(days)
    ]

    top = db.execute(
        select(Room.name, func.count(Booking.id))
        .join(Booking, Booking.room_id == Room.id)
        .where(Booking.status.in_(ACTIVE_STATUSES))
        .group_by(Room.name)
        .order_by(func.count(Booking.id).desc())
        .limit(5)
    ).all()

    return DashboardOut(
        total_rooms=db.scalar(select(func.count()).select_from(Room).where(Room.is_active)) or 0,
        total_users=db.scalar(select(func.count()).select_from(User)) or 0,
        bookings_today=db.scalar(
            select(func.count())
            .select_from(Booking)
            .where(
                Booking.start_at >= today_start.astimezone(UTC),
                Booking.start_at < today_end.astimezone(UTC),
                Booking.status.in_(ACTIVE_STATUSES),
            )
        )
        or 0,
        pending_count=db.scalar(
            select(func.count()).select_from(Booking).where(Booking.status == BookingStatus.pending)
        )
        or 0,
        by_day=by_day,
        top_rooms=[RoomCount(room=name, count=c) for name, c in top],
    )


def bookings_to_xlsx(bookings: list[Booking]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Брони"
    headers = ["ID", "Зал", "Тема", "Начало", "Окончание", "Участников", "Статус", "Кто бронировал", "Email"]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for b in bookings:
        ws.append(
            [
                b.id,
                b.room.name,
                b.title,
                b.start_at.astimezone(OFFICE_TZ).strftime("%d.%m.%Y %H:%M"),
                b.end_at.astimezone(OFFICE_TZ).strftime("%d.%m.%Y %H:%M"),
                b.attendees,
                STATUS_RU[b.status],
                b.user.full_name,
                b.user.email,
            ]
        )
    widths = [6, 24, 32, 18, 18, 12, 14, 24, 28]
    for i, w in enumerate(widths):
        ws.column_dimensions[chr(ord("A") + i)].width = w
    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()
