"""Настройки приложения. Все значения берутся из переменных окружения (.env)."""

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "MeetSpace"
    database_url: str = "postgresql+psycopg://app:app@localhost:5432/booking"

    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 7

    # Список разрешённых источников для CORS через запятую
    cors_origins: str = "http://localhost:5173"
    # Адрес фронтенда — нужен для ссылки восстановления пароля
    frontend_url: str = "http://localhost:5173"

    upload_dir: str = "uploads"
    # Папка с собранным фронтендом (только для деплоя одним сервисом)
    static_dir: str = ""
    max_upload_mb: int = 5

    # Правила бронирования
    work_day_start_hour: int = 8
    work_day_end_hour: int = 22
    slot_minutes: int = 30
    max_booking_hours: int = 4

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, v: str) -> str:
        # хостинги выдают адрес вида postgres://... — приводим к драйверу psycopg3
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix) :]
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
