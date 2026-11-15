"""Залы, локации, удобства и фото залов."""

import uuid
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import Conflict, NotFound, ValidationFailed
from app.models import Room, RoomPhoto, User
from app.repositories import RoomRepo
from app.schemas import RoomIn
from app.services.audit import log_action

ALLOWED_IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
# «магические байты» — проверяем, что файл действительно картинка, а не просто так назван
MAGIC = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
}


def upload_dir() -> Path:
    path = Path(settings.upload_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def validate_image(content_type: str, data: bytes) -> str:
    """Возвращает расширение файла или бросает ошибку. Покрыто unit-тестами."""
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise ValidationFailed("Разрешены только изображения JPG, PNG или WEBP")
    if len(data) == 0:
        raise ValidationFailed("Файл пустой")
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise ValidationFailed(f"Размер файла не больше {settings.max_upload_mb} МБ")
    if not data.startswith(MAGIC[content_type]):
        raise ValidationFailed("Содержимое файла не совпадает с его типом")
    return ALLOWED_IMAGE_TYPES[content_type]


class RoomService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = RoomRepo(db)

    def get(self, room_id: int, *, include_inactive: bool = False) -> Room:
        room = self.repo.get(room_id)
        if room is None or (not room.is_active and not include_inactive):
            raise NotFound("Зал не найден")
        return room

    def _apply(self, room: Room, data: RoomIn) -> None:
        if self.repo.location(data.location_id) is None:
            raise ValidationFailed("Локация не найдена", [{"field": "location_id", "message": "not found"}])
        amenities = self.repo.amenities_by_ids(data.amenity_ids)
        if len(amenities) != len(set(data.amenity_ids)):
            raise ValidationFailed("Некоторые удобства не найдены")
        room.location_id = data.location_id
        room.name = data.name.strip()
        room.description = data.description
        room.capacity = data.capacity
        room.floor = data.floor
        room.is_active = data.is_active
        room.amenities = amenities

    def create(self, actor: User, data: RoomIn) -> Room:
        room = Room()
        self._apply(room, data)
        self.db.add(room)
        self.db.flush()
        log_action(self.db, actor, "room.create", "room", room.id, name=room.name)
        self.db.commit()
        return self.repo.get(room.id)

    def update(self, actor: User, room_id: int, data: RoomIn) -> Room:
        room = self.get(room_id, include_inactive=True)
        self._apply(room, data)
        log_action(self.db, actor, "room.update", "room", room.id, name=room.name)
        self.db.commit()
        return self.repo.get(room.id)

    def delete(self, actor: User, room_id: int) -> None:
        room = self.get(room_id, include_inactive=True)
        log_action(self.db, actor, "room.delete", "room", room.id, name=room.name)
        self.db.delete(room)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            raise Conflict("Зал нельзя удалить") from None

    async def add_photo(self, actor: User, room_id: int, file: UploadFile) -> RoomPhoto:
        room = self.get(room_id, include_inactive=True)
        data = await file.read()
        ext = validate_image(file.content_type or "", data)
        name = f"{uuid.uuid4().hex}{ext}"  # своё имя файла: защита от подмены путей
        (upload_dir() / name).write_bytes(data)
        photo = RoomPhoto(room_id=room.id, file_name=name, content_type=file.content_type, size_bytes=len(data))
        self.db.add(photo)
        self.db.flush()
        log_action(self.db, actor, "room.photo_add", "room", room.id, file=name)
        self.db.commit()
        return photo

    def delete_photo(self, actor: User, room_id: int, photo_id: int) -> None:
        photo = self.db.get(RoomPhoto, photo_id)
        if photo is None or photo.room_id != room_id:
            raise NotFound("Фото не найдено")
        (upload_dir() / photo.file_name).unlink(missing_ok=True)
        self.db.delete(photo)
        log_action(self.db, actor, "room.photo_delete", "room", room_id)
        self.db.commit()
