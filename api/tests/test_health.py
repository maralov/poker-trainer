"""Фаза 0: застосунок піднімається і віддає /healthz."""

import httpx
import pytest

from app.main import app


@pytest.mark.anyio
async def test_healthz() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
