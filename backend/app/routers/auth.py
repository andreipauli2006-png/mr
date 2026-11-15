from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db import get_db
from app.models import User
from app.schemas import (
    ChangePasswordIn,
    ForgotPasswordIn,
    LoginIn,
    RefreshIn,
    RegisterIn,
    ResetPasswordIn,
    TokenPair,
    UserOut,
)
from app.services.auth import AuthService

router = APIRouter(prefix="/auth", tags=["Авторизация"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    """Регистрация. Новый пользователь получает роль «гость»."""
    return AuthService(db).register(data)


@router.post("/login", response_model=TokenPair)
def login(data: LoginIn, db: Session = Depends(get_db)):
    return AuthService(db).login(data.email, data.password)


@router.post("/refresh", response_model=TokenPair)
def refresh(data: RefreshIn, db: Session = Depends(get_db)):
    """Обмен refresh-токена на новую пару токенов (старый отзывается)."""
    return AuthService(db).refresh(data.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(data: RefreshIn, db: Session = Depends(get_db)):
    AuthService(db).logout(data.refresh_token)


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(data: ForgotPasswordIn, db: Session = Depends(get_db)):
    """Ссылка для сброса выводится в лог сервера (так разрешено ТЗ)."""
    AuthService(db).forgot_password(data.email)
    return {"message": "Если email зарегистрирован, ссылка для сброса отправлена"}


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(data: ResetPasswordIn, db: Session = Depends(get_db)):
    AuthService(db).reset_password(data.token, data.new_password)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(data: ChangePasswordIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    AuthService(db).change_password(user, data.old_password, data.new_password)
