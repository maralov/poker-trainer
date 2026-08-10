"""Фаза 2: реєстрація, вхід, вихід, поточний користувач."""

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_access_token, decode_access_token, hash_password, verify_password
from app.config import get_settings
from app.models import User

settings = get_settings()

GOOD = {"email": "hero@example.com", "password": "correct-horse"}


async def test_register_login_me_logout(client: httpx.AsyncClient) -> None:
    r = await client.post("/auth/register", json=GOOD)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["email"] == GOOD["email"]
    assert "id" in body
    assert "password" not in body and "password_hash" not in body
    assert settings.cookie_name in r.cookies

    # Cookie з реєстрації вже авторизує — окремий логін не потрібен.
    r = await client.get("/auth/me")
    assert r.status_code == 200
    assert r.json()["email"] == GOOD["email"]

    r = await client.post("/auth/logout")
    assert r.status_code == 204

    r = await client.get("/auth/me")
    assert r.status_code == 401

    r = await client.post("/auth/login", json=GOOD)
    assert r.status_code == 200
    assert settings.cookie_name in r.cookies

    r = await client.get("/auth/me")
    assert r.status_code == 200


async def test_duplicate_email_conflicts(client: httpx.AsyncClient) -> None:
    assert (await client.post("/auth/register", json=GOOD)).status_code == 201
    r = await client.post("/auth/register", json=GOOD)
    assert r.status_code == 409
    assert "вже існує" in r.json()["detail"]


async def test_email_is_case_insensitive(client: httpx.AsyncClient) -> None:
    assert (await client.post("/auth/register", json=GOOD)).status_code == 201
    # citext: HERO@ і hero@ — той самий користувач
    r = await client.post("/auth/register", json={**GOOD, "email": "HERO@example.com"})
    assert r.status_code == 409

    r = await client.post("/auth/login", json={**GOOD, "email": "Hero@Example.com"})
    assert r.status_code == 200


async def test_wrong_password_is_401(client: httpx.AsyncClient) -> None:
    await client.post("/auth/register", json=GOOD)
    r = await client.post("/auth/login", json={**GOOD, "password": "wrong-password"})
    assert r.status_code == 401
    assert r.json()["detail"] == "Невірний email або пароль"


async def test_unknown_email_gives_same_answer_as_wrong_password(
    client: httpx.AsyncClient,
) -> None:
    # Інакше форма логіну стає способом перебирати зареєстровані адреси.
    await client.post("/auth/register", json=GOOD)
    unknown = await client.post(
        "/auth/login", json={"email": "nobody@example.com", "password": "correct-horse"}
    )
    wrong = await client.post("/auth/login", json={**GOOD, "password": "wrong-password"})
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json()


async def test_me_without_cookie_is_401(client: httpx.AsyncClient) -> None:
    r = await client.get("/auth/me")
    assert r.status_code == 401


async def test_me_with_garbage_cookie_is_401(client: httpx.AsyncClient) -> None:
    # Значення тільки ASCII: httpx не вміє кодувати кирилицю в заголовку cookie.
    r = await client.get("/auth/me", cookies={settings.cookie_name: "not-a-token"})
    assert r.status_code == 401


async def test_me_with_token_of_deleted_user_is_401(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await client.post("/auth/register", json=GOOD)
    user = await session.scalar(select(User).where(User.email == GOOD["email"]))
    assert user is not None
    await session.delete(user)
    await session.commit()

    r = await client.get("/auth/me")
    assert r.status_code == 401


async def test_token_signed_with_other_secret_is_rejected(client: httpx.AsyncClient) -> None:
    import jwt

    forged = jwt.encode(
        {"sub": "00000000-0000-0000-0000-000000000000", "exp": 9_999_999_999},
        "not-our-secret",
        algorithm="HS256",
    )
    r = await client.get("/auth/me", cookies={settings.cookie_name: forged})
    assert r.status_code == 401


async def test_expired_token_is_rejected(client: httpx.AsyncClient) -> None:
    import jwt

    expired = jwt.encode(
        {"sub": "00000000-0000-0000-0000-000000000000", "exp": 1_000_000_000},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    r = await client.get("/auth/me", cookies={settings.cookie_name: expired})
    assert r.status_code == 401


async def test_cookie_is_httponly(client: httpx.AsyncClient) -> None:
    r = await client.post("/auth/register", json=GOOD)
    set_cookie = r.headers["set-cookie"]
    assert "HttpOnly" in set_cookie
    assert "Path=/" in set_cookie


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "не-емейл", "password": "correct-horse"},
        {"email": "hero@example.com", "password": "short"},
        {"email": "hero@example.com"},
        {"password": "correct-horse"},
        {},
    ],
)
async def test_register_validation(client: httpx.AsyncClient, payload: dict[str, str]) -> None:
    r = await client.post("/auth/register", json=payload)
    assert r.status_code == 422


async def test_password_longer_than_bcrypt_limit_is_rejected(client: httpx.AsyncClient) -> None:
    # bcrypt мовчки обрізає на 72 байтах — краще явна відмова, ніж пароль,
    # у якого значуща лише частина.
    r = await client.post(
        "/auth/register", json={"email": "long@example.com", "password": "п" * 40}
    )
    assert r.status_code == 422


async def test_password_is_hashed_not_stored(
    client: httpx.AsyncClient, session: AsyncSession
) -> None:
    await client.post("/auth/register", json=GOOD)
    user = await session.scalar(select(User).where(User.email == GOOD["email"]))
    assert user is not None
    assert user.password_hash != GOOD["password"]
    assert user.password_hash.startswith("$2b$")
    assert verify_password(GOOD["password"], user.password_hash)


class TestPrimitives:
    def test_hash_is_salted(self) -> None:
        a, b = hash_password("same-password"), hash_password("same-password")
        assert a != b
        assert verify_password("same-password", a)
        assert verify_password("same-password", b)

    def test_verify_rejects_wrong_password(self) -> None:
        assert not verify_password("nope", hash_password("same-password"))

    def test_verify_survives_corrupt_hash(self) -> None:
        # Пошкоджений хеш у базі не має давати 500 на логіні.
        assert not verify_password("any", "не-хеш")

    def test_token_roundtrip(self) -> None:
        import uuid

        uid = uuid.uuid4()
        assert decode_access_token(create_access_token(uid)) == uid

    def test_decode_rejects_garbage(self) -> None:
        assert decode_access_token("не-токен") is None
        assert decode_access_token("") is None
