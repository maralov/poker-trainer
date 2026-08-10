# Poker Trainer

Тренажер префлопу для 9-max кешу: чотири сценарії (відкриття, ізоляція лімперів, проти рейзу,
проти 3-бету), drill по накопичених помилках, ворота до постфлоп-етапу.

Веб-версія standalone-файла `poker-trainer.html` — з логіном, збереженням прогресу на сервері
і синком між пристроями.

## Стек

| Шар | Технологія |
|---|---|
| Frontend | React 19 + Vite + TypeScript (strict) |
| State | zustand |
| Backend | Python 3.12 + FastAPI + Pydantic v2 |
| ORM/DB | SQLAlchemy 2 (async) + Alembic + PostgreSQL 16 |
| Auth | bcrypt + JWT в httpOnly cookie |
| Тести | vitest (web), pytest + httpx (api) |

## Швидкий старт

Потрібні: Docker, Node 20+, [uv](https://docs.astral.sh/uv/).

```bash
git clone <repo> && cd poker-trainer

# 1. База
docker compose up -d
docker compose ps          # postgres має бути (healthy)

# 2. API
cd api
/bin/cp ../.env.example .env      # секцію api; відредагуй за потреби
uv sync
uv run uvicorn app.main:app --reload --port 8000
# перевірка: curl http://localhost:8000/healthz  →  {"status":"ok"}

# 3. Web (в іншому терміналі)
cd web
npm install
npm run dev                # http://localhost:5173
```

## Тести

```bash
cd api && uv run pytest
cd web && npm test
```

Тести engine звіряються з еталоном, знятим із `poker-trainer.html`: склад усіх
діапазонів (`ref-truth.json`) і 471 спот, згенерований референсною `preBuildSpot`
під детермінованим `Math.random` (`ref-spots.json`). Порт перевіряється проти
оригіналу, а не проти чисел, вписаних з голови — деталі в
`web/src/engine/__fixtures__/README.md`.

## Структура

```
poker-trainer/
├── PLAN.md              # план розробки по фазах
├── CLAUDE.md            # правила для агентів і людей
├── poker-trainer.html   # standalone-референс, джерело істини для ігрової логіки
├── docker-compose.yml   # postgres:16 для локальної розробки
├── web/
│   └── src/
│       ├── engine/      # чиста ігрова логіка, без React
│       ├── store/       # zustand: сесія, черга спроб, auth
│       ├── api/         # типізований клієнт до бекенду
│       ├── components/
│       └── pages/
└── api/
    ├── app/
    │   ├── main.py
    │   ├── config.py    # pydantic-settings, усе з env
    │   ├── db.py
    │   ├── models.py
    │   ├── schemas.py
    │   ├── auth.py
    │   └── routers/
    ├── alembic/
    └── tests/
```

## Прогрес по фазах

- [x] **Фаза 0** — скелет монорепо
- [x] **Фаза 1** — міграція тренажера в React (без бекенду)
- [ ] **Фаза 2** — бекенд: моделі + auth
- [ ] **Фаза 3** — журнал спроб + статистика
- [ ] **Фаза 4** — інтеграція клієнта
- [ ] **Фаза 5** — деплой
