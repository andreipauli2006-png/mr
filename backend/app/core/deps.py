"""Зависимости FastAPI: текущий пользователь и проверка ролей (RBAC)."""

from collections.abc import Callable

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import Forbidden, Unauthorized
from app.core.security import decode_access_token
from app.db import get_db
from app.models import Role, User

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise Unauthorized("Требуется авторизация")
    try:
        payload = decode_access_token(creds.credentials)
    except jwt.PyJWTError:
        raise Unauthorized("Токен недействителен или истёк") from None
    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise Unauthorized("Пользователь не найден")
    if user.is_blocked:
        raise Forbidden("Аккаунт заблокирован")
    return user


def get_optional_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User | None:
    if creds is None:
        return None
    return get_current_user(creds, db)


def require_roles(*roles: Role) -> Callable[[User], User]:
    """Пример: Depends(require_roles(Role.admin)) — пустит только администратора."""

    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise Forbidden("Недостаточно прав для этого действия")
        return user

    return checker


require_admin = require_roles(Role.admin)
