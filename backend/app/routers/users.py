from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.core.errors import NotFound, ValidationFailed
from app.db import get_db
from app.models import Role, User
from app.repositories import AuditRepo, UserRepo
from app.schemas import AdminUserUpdateIn, AuditOut, Page, ProfileUpdateIn, UserOut
from app.services.audit import log_action

router = APIRouter(tags=["Пользователи"])


@router.get("/users/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/users/me", response_model=UserOut)
def update_me(data: ProfileUpdateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.full_name = data.full_name.strip()
    log_action(db, user, "user.profile_update", "user", user.id)
    db.commit()
    return user


@router.get("/users/me/history", response_model=Page[AuditOut])
def my_history(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """История действий текущего пользователя (личный кабинет)."""
    items, total = AuditRepo(db).list(None, user.id, page, size)
    return Page(items=items, total=total, page=page, size=size)


# ---------- Администрирование ----------
@router.get("/admin/users", response_model=Page[UserOut])
def list_users(
    search: str | None = Query(None, max_length=100),
    role: Role | None = None,
    sort: str | None = Query(None, description="email | full_name | created_at, с «-» — по убыванию"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    items, total = UserRepo(db).list(search, role, sort, page, size)
    return Page(items=items, total=total, page=page, size=size)


@router.patch("/admin/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    data: AdminUserUpdateIn,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Смена роли и блокировка пользователя."""
    target = db.get(User, user_id)
    if target is None:
        raise NotFound("Пользователь не найден")
    if target.id == admin.id:
        raise ValidationFailed("Нельзя менять роль или блокировать самого себя")
    if data.role is not None:
        target.role = data.role
    if data.is_blocked is not None:
        target.is_blocked = data.is_blocked
    log_action(db, admin, "admin.user_update", "user", target.id, **data.model_dump(exclude_none=True, mode="json"))
    db.commit()
    return target


@router.get("/admin/audit", response_model=Page[AuditOut])
def audit_log(
    action: str | None = None,
    user_id: int | None = None,
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    items, total = AuditRepo(db).list(action, user_id, page, size)
    return Page(items=items, total=total, page=page, size=size)
