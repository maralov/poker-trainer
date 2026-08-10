"""Реєстрація, вхід, вихід, поточний користувач."""

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.auth import (
    CurrentUser,
    DbSession,
    clear_auth_cookie,
    create_access_token,
    hash_password,
    set_auth_cookie,
    verify_password,
)
from app.models import User
from app.schemas import LoginIn, RegisterIn, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterIn, response: Response, session: DbSession) -> User:
    user = User(email=payload.email, password_hash=hash_password(payload.password))
    session.add(user)
    try:
        await session.commit()
    except IntegrityError:
        # Покладаємось на UNIQUE, а не на попередній SELECT: між перевіркою
        # і вставкою міг встигнути інший запит.
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Користувач з таким email вже існує",
        ) from None

    await session.refresh(user)
    set_auth_cookie(response, create_access_token(user.id))
    return user


@router.post("/login", response_model=UserOut)
async def login(payload: LoginIn, response: Response, session: DbSession) -> User:
    user = await session.scalar(select(User).where(User.email == payload.email))
    # Однакова відповідь на «немає такого email» і «невірний пароль»:
    # інакше форма логіну стає способом перебирати зареєстровані адреси.
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Невірний email або пароль",
        )

    set_auth_cookie(response, create_access_token(user.id))
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    clear_auth_cookie(response)


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> User:
    return user
