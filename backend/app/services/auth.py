"""Регистрация, вход, обновление токенов, восстановление пароля."""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import Conflict, Forbidden, Unauthorized, ValidationFailed
from app.core.security import (
    create_access_token,
    hash_password,
    hash_token,
    new_opaque_token,
    verify_password,
)
from app.models import PasswordResetToken, RefreshToken, Role, User
from app.repositories import UserRepo
from app.schemas import RegisterIn, TokenPair
from app.services.audit import log_action

logger = logging.getLogger("meetspace.auth")


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.users = UserRepo(db)

    # --- регистрация / вход ---
    def register(self, data: RegisterIn) -> User:
        if self.users.by_email(data.email):
            raise Conflict("Пользователь с таким email уже зарегистрирован")
        user = User(
            email=data.email.lower(),
            full_name=data.full_name.strip(),
            password_hash=hash_password(data.password),
            role=Role.guest,  # новые пользователи — гости; сотрудником делает админ
        )
        self.db.add(user)
        self.db.flush()
        log_action(self.db, user, "user.register", "user", user.id)
        self.db.commit()
        return user

    def login(self, email: str, password: str) -> TokenPair:
        user = self.users.by_email(email)
        if user is None or not verify_password(password, user.password_hash):
            raise Unauthorized("Неверный email или пароль")
        if user.is_blocked:
            raise Forbidden("Аккаунт заблокирован администратором")
        tokens = self._issue_tokens(user)
        log_action(self.db, user, "user.login", "user", user.id)
        self.db.commit()
        return tokens

    def _issue_tokens(self, user: User) -> TokenPair:
        refresh = new_opaque_token()
        self.db.add(
            RefreshToken(
                user_id=user.id,
                token_hash=hash_token(refresh),
                expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_days),
            )
        )
        return TokenPair(access_token=create_access_token(user.id, user.role.value), refresh_token=refresh)

    # --- refresh: старый токен отзываем, выдаём новую пару (ротация) ---
    def refresh(self, refresh_token: str) -> TokenPair:
        record = self.db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token)))
        if record is None or record.revoked or record.expires_at < datetime.now(UTC):
            raise Unauthorized("Сессия истекла, войдите заново")
        user = self.db.get(User, record.user_id)
        if user is None or user.is_blocked:
            raise Unauthorized("Сессия недействительна")
        record.revoked = True
        tokens = self._issue_tokens(user)
        self.db.commit()
        return tokens

    def logout(self, refresh_token: str) -> None:
        self.db.execute(
            update(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token)).values(revoked=True)
        )
        self.db.commit()

    # --- восстановление пароля ---
    def forgot_password(self, email: str) -> None:
        """Письмо не отправляем (разрешено ТЗ): ссылку пишем в лог сервера."""
        user = self.users.by_email(email)
        if user is None:
            return  # не сообщаем, существует ли email
        token = new_opaque_token()
        self.db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=hash_token(token),
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        self.db.commit()
        logger.warning(
            "Ссылка для сброса пароля %s: %s/reset-password?token=%s", user.email, settings.frontend_url, token
        )

    def reset_password(self, token: str, new_password: str) -> None:
        record = self.db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(token)))
        if record is None or record.used or record.expires_at < datetime.now(UTC):
            raise ValidationFailed("Ссылка недействительна или устарела")
        user = self.db.get(User, record.user_id)
        user.password_hash = hash_password(new_password)
        record.used = True
        # после смены пароля выходим со всех устройств
        self.db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id).values(revoked=True))
        log_action(self.db, user, "user.password_reset", "user", user.id)
        self.db.commit()

    def change_password(self, user: User, old: str, new: str) -> None:
        if not verify_password(old, user.password_hash):
            raise ValidationFailed("Текущий пароль указан неверно")
        user.password_hash = hash_password(new)
        log_action(self.db, user, "user.password_change", "user", user.id)
        self.db.commit()
