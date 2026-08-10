"""Pydantic DTO. Валідація вхідних даних живе тут, а не в роутерах."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.auth import MAX_PASSWORD_BYTES

Stage = Literal["pre", "post"]
Scenario = Literal["rfi", "iso", "vsraise", "vs3bet"]
Action = Literal["raise", "call", "fold"]

POSITIONS = ("UTG", "UTG+1", "MP", "LJ", "HJ", "CO", "BTN", "SB", "BB")
Position = Literal["UTG", "UTG+1", "MP", "LJ", "HJ", "CO", "BTN", "SB", "BB"]


class RegisterIn(BaseModel):
    email: EmailStr
    password: Annotated[str, Field(min_length=8, max_length=200)]

    @field_validator("password")
    @classmethod
    def password_fits_bcrypt(cls, v: str) -> str:
        # bcrypt мовчки обрізає вхід на 72 байтах: краще відмовити явно,
        # ніж дати користувачу пароль, у якого значуща лише частина.
        if len(v.encode()) > MAX_PASSWORD_BYTES:
            raise ValueError(f"пароль задовгий: максимум {MAX_PASSWORD_BYTES} байтів")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str


class AttemptIn(BaseModel):
    """Одна спроба з клієнтської черги синку."""

    client_id: Annotated[str, Field(min_length=1, max_length=64)]
    stage: Stage = "pre"
    scenario: Scenario
    position: Position
    hand: Annotated[str, Field(min_length=2, max_length=3)]
    villain_pos: Position | None = None
    limpers: Annotated[int, Field(ge=0, le=8)] | None = None
    chosen: Action
    correct: Action
    is_drill: bool = False
    is_control: bool = False
    answered_at: datetime

    @property
    def is_correct(self) -> bool:
        return self.chosen == self.correct


class AttemptsBatchIn(BaseModel):
    # Ліміт із PLAN.md: батч не має ставати способом залити гігабайт за раз.
    attempts: Annotated[list[AttemptIn], Field(min_length=1, max_length=500)]


class AttemptsBatchOut(BaseModel):
    accepted: int
    duplicates: int


class AttemptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: str
    stage: str
    scenario: str
    position: str
    hand: str
    villain_pos: str | None
    limpers: int | None
    chosen: str
    correct: str
    is_correct: bool
    is_drill: bool
    is_control: bool
    answered_at: datetime
