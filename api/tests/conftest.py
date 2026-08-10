"""
Спільні фікстури.

Тести ганяються проти справжнього Postgres, а не SQLite: у схемі є citext,
ON CONFLICT і SQL-агрегації, яких SQLite не відтворює. База окрема
(poker_trainer_test) — створюється в api/scripts/init-db.sql.
"""

import os
from collections.abc import AsyncGenerator

import httpx
import pytest
from sqlalchemy import NullPool
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db import Base, get_session
from app.main import app

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://poker:poker@localhost:5433/poker_trainer_test",
)

# NullPool обов'язковий: pytest-asyncio дає кожному тесту свій event loop,
# а з'єднання asyncpg прив'язане до того loop'а, у якому створене. Пул
# перевикористав би з'єднання з уже закритого loop'а і падав би на
# «attached to a different loop».
test_engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)


@pytest.fixture(autouse=True)
async def clean_schema() -> AsyncGenerator[None]:
    """Кожен тест починає з порожньої схеми — тести не мають залежати від порядку."""
    async with test_engine.begin() as conn:
        await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS citext")
        await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS pgcrypto")
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest.fixture
async def session() -> AsyncGenerator[AsyncSession]:
    async with TestSessionLocal() as s:
        yield s


@pytest.fixture
async def client() -> AsyncGenerator[httpx.AsyncClient]:
    """HTTP-клієнт із підміненою залежністю сесії; cookies зберігаються між запитами."""

    async def override_get_session() -> AsyncGenerator[AsyncSession]:
        async with TestSessionLocal() as s:
            yield s

    app.dependency_overrides[get_session] = override_get_session
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
async def auth_client(client: httpx.AsyncClient) -> httpx.AsyncClient:
    """Клієнт із уже зареєстрованим і залогіненим користувачем."""
    r = await client.post(
        "/auth/register", json={"email": "hero@example.com", "password": "correct-horse"}
    )
    assert r.status_code == 201, r.text
    return client
