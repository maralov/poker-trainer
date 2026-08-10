"""
Моделі БД.

Принцип із PLAN.md: сирі події, не агрегати. Кожна відповідь — окремий рядок
в attempts. Жодних лічильників типу byPos у базі: статистика, ворота і drill-пули
рахуються запитами.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import CITEXT, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    # citext — щоб UNIQUE був нечутливий до регістру без нормалізації в коді
    email: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    attempts: Mapped[list["Attempt"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Attempt(Base):
    """Одна відповідь користувача. Ідемпотентність синку — по (user_id, client_id)."""

    __tablename__ = "attempts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # uuid, згенерований клієнтом: повторний батч не має створювати дублів
    client_id: Mapped[str] = mapped_column(Text, nullable=False)

    stage: Mapped[str] = mapped_column(String(4), nullable=False)  # 'pre' | 'post'
    scenario: Mapped[str] = mapped_column(String(16), nullable=False)
    position: Mapped[str] = mapped_column(String(8), nullable=False)
    hand: Mapped[str] = mapped_column(String(4), nullable=False)

    # Опенер для vsraise, 3-бетор для vs3bet; для rfi та iso — NULL.
    villain_pos: Mapped[str | None] = mapped_column(String(8), nullable=True)
    # Кількість лімперів для iso (від неї залежить звужений діапазон); інакше NULL.
    limpers: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    chosen: Mapped[str] = mapped_column(String(8), nullable=False)
    correct: Mapped[str] = mapped_column(String(8), nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    is_drill: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_control: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    # Час на клієнті — саме він визначає порядок у ковзному вікні воріт.
    answered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    user: Mapped[User] = relationship(back_populates="attempts")

    __table_args__ = (
        UniqueConstraint("user_id", "client_id", name="uq_attempts_user_client"),
        Index("ix_attempts_user_scenario_answered", "user_id", "scenario", "answered_at"),
        Index("ix_attempts_user_answered", "user_id", "answered_at"),
    )
