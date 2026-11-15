"""Тестовые данные. Запуск: python -m app.seed  (повторный запуск ничего не дублирует)."""

import random
from datetime import datetime, timedelta

from sqlalchemy import select

from app.core.security import hash_password
from app.db import SessionLocal
from app.models import Amenity, Booking, BookingStatus, Location, Role, Room, User
from app.services.bookings import OFFICE_TZ

USERS = [
    ("admin@meetspace.ru", "Admin12345", "Анна Админова", Role.admin),
    ("employee@meetspace.ru", "Employee123", "Иван Сотрудников", Role.employee),
    ("employee2@meetspace.ru", "Employee123", "Мария Петрова", Role.employee),
    ("guest@meetspace.ru", "Guest12345", "Олег Гостев", Role.guest),
]

AMENITIES = ["Проектор", "Маркерная доска", "Видеосвязь", "Телевизор", "Кофемашина", "Кондиционер"]

LOCATIONS = [
    ("Бизнес-центр «Север»", "Москва, ул. Лесная, 5"),
    ("Коворкинг «Точка»", "Москва, Ленинский пр-т, 30"),
]

ROOMS = [
    # (локация, название, вместимость, этаж, удобства, описание)
    (0, "Переговорная «Альфа»", 6, 3, [0, 1, 5], "Небольшая комната для встреч команды."),
    (0, "Переговорная «Бета»", 10, 3, [0, 2, 3, 5], "Зал для созвонов с клиентами."),
    (0, "Конференц-зал", 40, 1, [0, 2, 3, 5], "Большой зал для презентаций и собраний."),
    (0, "Фокус-комната", 2, 4, [5], "Тихое место для звонков один на один."),
    (1, "Open Space · стол 1", 1, 2, [4], "Рабочее место в открытом пространстве."),
    (1, "Лофт", 15, 2, [1, 3, 4], "Креативное пространство для мозговых штурмов."),
    (1, "Студия подкастов", 4, 2, [2], "Звукоизолированная комната с микрофонами."),
    (1, "Зал «Гамма»", 20, 3, [0, 1, 2, 5], "Зал для воркшопов и обучения."),
]

TITLES = [
    "Планёрка",
    "Созвон с клиентом",
    "Собеседование",
    "Ретроспектива",
    "Демо спринта",
    "Обучение",
    "Встреча 1:1",
    "Мозговой штурм",
    "Презентация",
    "Синк команды",
]


def run() -> None:
    db = SessionLocal()
    if db.scalar(select(User).limit(1)):
        print("Данные уже есть — пропускаю")
        return

    users = [User(email=e, password_hash=hash_password(p), full_name=n, role=r) for e, p, n, r in USERS]
    amenities = [Amenity(name=n) for n in AMENITIES]
    locations = [Location(name=n, address=a) for n, a in LOCATIONS]
    db.add_all(users + amenities + locations)
    db.flush()

    rooms = []
    for loc, name, cap, floor, am, desc in ROOMS:
        rooms.append(
            Room(
                location_id=locations[loc].id,
                name=name,
                capacity=cap,
                floor=floor,
                description=desc,
                amenities=[amenities[i] for i in am],
            )
        )
    db.add_all(rooms)
    db.flush()

    # брони за прошлые 14 дней и на неделю вперёд, без пересечений
    rnd = random.Random(42)
    today = datetime.now(OFFICE_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    for day_offset in range(-13, 8):
        day = today + timedelta(days=day_offset)
        if day.weekday() >= 5:
            continue
        for room in rnd.sample(rooms, k=rnd.randint(2, 5)):
            hour = 9
            while hour < 19 and rnd.random() < 0.6:
                hour += rnd.randint(0, 2)
                length = rnd.choice([1, 1, 2])
                if hour + length > 21:
                    break
                start = day.replace(hour=hour)
                author = rnd.choice(users)
                if day_offset < 0:
                    status = rnd.choice([BookingStatus.confirmed] * 5 + [BookingStatus.cancelled])
                elif author.role == Role.guest:
                    status = BookingStatus.pending
                else:
                    status = BookingStatus.confirmed
                db.add(
                    Booking(
                        room_id=room.id,
                        user_id=author.id,
                        title=rnd.choice(TITLES),
                        start_at=start,
                        end_at=start + timedelta(hours=length),
                        attendees=max(1, min(room.capacity, rnd.randint(1, 8))),
                        status=status,
                    )
                )
                hour += length
    db.commit()
    print("Тестовые данные созданы:")
    for e, p, _, r in USERS:
        print(f"  {r.value:9} {e} / {p}")


if __name__ == "__main__":
    run()
