"""users and attempts

Revision ID: 1ae98add3f9f
Revises:
Create Date: 2026-08-10 14:41:36.930208

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "1ae98add3f9f"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Розширення створюються тут, а не лише в docker-compose init-скрипті:
    # на керованому Postgres (Railway) свіжа база їх не має, і міграція
    # має підняти схему самостійно.
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("email", postgresql.CITEXT(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_table(
        "attempts",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("client_id", sa.Text(), nullable=False),
        sa.Column("stage", sa.String(length=4), nullable=False),
        sa.Column("scenario", sa.String(length=16), nullable=False),
        sa.Column("position", sa.String(length=8), nullable=False),
        sa.Column("hand", sa.String(length=4), nullable=False),
        sa.Column("villain_pos", sa.String(length=8), nullable=True),
        sa.Column("limpers", sa.SmallInteger(), nullable=True),
        sa.Column("chosen", sa.String(length=8), nullable=False),
        sa.Column("correct", sa.String(length=8), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.Column("is_drill", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("is_control", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "client_id", name="uq_attempts_user_client"),
    )
    op.create_index(
        "ix_attempts_user_answered", "attempts", ["user_id", "answered_at"], unique=False
    )
    op.create_index(
        "ix_attempts_user_scenario_answered",
        "attempts",
        ["user_id", "scenario", "answered_at"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_attempts_user_scenario_answered", table_name="attempts")
    op.drop_index("ix_attempts_user_answered", table_name="attempts")
    op.drop_table("attempts")
    op.drop_table("users")
    # Розширення навмисно не видаляються: ними може користуватись інша схема.
