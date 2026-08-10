# Poker Trainer — веб-застосунок

План розробки для Claude Code. Виконувати фазами, кожна фаза закінчується робочим станом,
який можна закомітити і задеплоїти. Не переходити до наступної фази, поки не пройшли
критерії готовності поточної.

## Контекст

Є робочий standalone `poker-trainer.html` (~1300 рядків): префлоп-тренажер 9-max кешу
з чотирма сценаріями (RFI, ізоляція, проти рейзу, проти 3-бету), drill-режимом по
накопичених помилках, воротами до постфлоп-етапу, збереженням у localStorage.
Перетворюємо на веб-застосунок: логін, збереження прогресу по користувачу, деплой.

## Стек

| Шар       | Технологія                                | Причина |
|-----------|-------------------------------------------|---------|
| Frontend  | React 18 + Vite + TypeScript              | основний стек користувача |
| State     | zustand                                   | мінімум бойлерплейту, легко мігрувати з поточних глобальних змінних |
| Backend   | Python 3.12 + FastAPI + Pydantic v2       | ціль — навчання Python-бекенду |
| ORM/DB    | SQLAlchemy 2 (async) + Alembic + PostgreSQL | індустріальний стандарт |
| Auth      | власний: bcrypt + JWT (access у httpOnly cookie) | навчальна цінність; без зовнішніх auth-провайдерів |
| Деплой    | Railway (api + Postgres), Vercel (web)    | git push деплой, безкоштовний тір |
| Тести     | vitest (web), pytest + httpx (api)        | |

## Принципи

1. **Сирі події, не агрегати.** Сервер зберігає кожну відповідь окремим рядком.
   Статистика, гейти, drill-пули — похідні, обчислюються запитами. Жодних
   лічильників типу `byPos` у базі.
2. **Ігрова логіка живе на клієнті.** Діапазони, побудова спотів, перевірка
   правильності — синхронний TS-код без сервера. Сервер = auth + журнал подій + агрегації.
3. **Offline-tolerant.** Відповіді пишуться в localStorage-чергу і синкаються батчами.
   Тренування працює без мережі, синк доганяє.
4. **Кожна фаза деплоїться.** Немає стану «все розібрано, нічого не працює».

## Структура репозиторію (монорепо)

```
poker-trainer/
├── PLAN.md
├── CLAUDE.md              # правила для Claude Code (створити у Фазі 0)
├── web/                   # Vite + React + TS
│   ├── src/
│   │   ├── engine/        # чиста ігрова логіка, БЕЗ React
│   │   │   ├── ranges.ts      # RFI/ISO/VS_RAISE/VS_3BET, parseToken
│   │   │   ├── spots.ts       # buildSpot(scenario, force?)
│   │   │   ├── drill.ts       # пул, вибірка 70/30, критерії виходу
│   │   │   └── gate.ts        # умови розблокування етапу 2
│   │   ├── store/         # zustand: session, attempts-черга, auth
│   │   ├── api/           # типізований клієнт до бекенду
│   │   ├── components/    # Table, HandCards, Grid13, DrillBar, Verdict...
│   │   ├── pages/         # Train, Ranges, Stats, Review, Login
│   │   └── main.tsx
│   └── package.json
├── api/                   # FastAPI
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py      # pydantic-settings, все з env
│   │   ├── db.py          # async engine + session
│   │   ├── models.py      # User, Attempt
│   │   ├── schemas.py     # Pydantic DTO
│   │   ├── auth.py        # hash, JWT, get_current_user
│   │   └── routers/
│   │       ├── auth.py    # /auth/register /auth/login /auth/logout /auth/me
│   │       ├── attempts.py# POST /attempts/batch, GET /attempts
│   │       └── stats.py   # GET /stats/{scenario}, GET /stats/gate
│   ├── alembic/
│   ├── tests/
│   └── pyproject.toml     # uv
└── docker-compose.yml     # postgres для локальної розробки
```

## Модель даних

```sql
users (
  id            uuid PK default gen_random_uuid(),
  email         citext UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL default now()
)

attempts (
  id          bigint PK generated always as identity,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id   text NOT NULL,          -- uuid з клієнта, для ідемпотентності синку
  stage       text NOT NULL,          -- 'pre' | 'post'
  scenario    text NOT NULL,          -- 'rfi' | 'iso' | 'vsraise' | 'vs3bet'
  position    text NOT NULL,          -- 'UTG'..'BB'
  hand        text NOT NULL,          -- 'T9s', 'AKo', '22'
  raiser_pos  text,                   -- позиція опенера для vsraise/vs3bet (nullable)
  chosen      text NOT NULL,          -- 'raise' | 'call' | 'fold'
  correct     text NOT NULL,
  is_correct  boolean NOT NULL,
  is_drill    boolean NOT NULL default false,
  is_control  boolean NOT NULL default false,
  answered_at timestamptz NOT NULL,   -- час на клієнті
  created_at  timestamptz NOT NULL default now(),
  UNIQUE (user_id, client_id)         -- повторний батч не дублює рядки
)
-- індекси: (user_id, scenario, answered_at), (user_id, answered_at)
```

`raiser_pos` — нове поле, якого немає в localStorage-версії: зберігаємо позицію
опенера, щоб drill міг відтворювати точний контекст (у поточній версії це відомий
компроміс).

## API (контракт)

```
POST /auth/register   {email, password}            -> 201, ставить cookie
POST /auth/login      {email, password}            -> 200, ставить cookie
POST /auth/logout                                  -> 204
GET  /auth/me                                      -> {id, email}

POST /attempts/batch  {attempts: [AttemptIn]}      -> {accepted, duplicates}
GET  /attempts?scenario=&limit=&before=            -> список (для дебагу/розбору)

GET  /stats/summary                                -> total, accuracy, best_streak
GET  /stats/scenario/{scenario}                    -> accuracy, byPosition (у межах сценарію!),
                                                      mistakes[{hand, position, correct, n}]
GET  /stats/gate                                   -> c1..c4, ok (rolling window 150)
GET  /stats/drill/{scenario}                       -> pool[{hand, position, n}], window accuracy
```

Агрегації — SQL-запитами з `attempts` (GROUP BY scenario, position...), без
матеріалізованих лічильників. Обсяги (тисячі рядків на користувача) цього не потребують.

---

## Фази

### Фаза 0 — скелет репозиторію
- Ініціалізувати монорепо за структурою вище; web через `npm create vite@latest` (react-ts),
  api через `uv init` + fastapi + uvicorn.
- `docker-compose.yml` з postgres:16, healthcheck.
- Створити `CLAUDE.md`: команди запуску обох частин, стиль (укр. коментарі ок,
  назви англійською), правило «сирі події, не агрегати», заборона зайвих залежностей.
- README з командами запуску.

**Готово, коли:** `docker compose up -d`, `uv run uvicorn app.main:app` віддає /healthz,
`npm run dev` показує заглушку.

### Фаза 1 — міграція тренажера в React (без бекенду)
- Перенести логіку з `poker-trainer.html` у `web/src/engine/` як чисті TS-модулі.
  Джерело істини — файл `poker-trainer.html` у корені репо (покласти копію).
  Нічого не «покращувати» в діапазонах — переносити 1:1.
- Написати vitest-тести на engine: parseToken (усі формати токенів), розміри діапазонів
  у комбо (RFI BTN ≈ 42%), buildSpot з force для всіх 4 сценаріїв, drill 70/30,
  retirement після 5 правильних, критерій виходу 90/50.
- Компоненти: стіл (9 сітів по колу), карти, сітка 13×13, вердикт, drill-бар,
  вкладки Train/Ranges/Stats/Review. Стилі перенести (CSS modules або tailwind — на розсуд,
  але зберегти поточний вигляд: темна тема, brass/ivory).
- Стан у zustand + persist у localStorage тим самим ключем НЕ треба — новий ключ,
  але написати одноразовий імпорт зі старого `poker_trainer_v3` (він містить log,
  recent, drill) при першому запуску.
- Гарячі клавіші 1/2/3/пробіл.

**Готово, коли:** усі тести engine зелені; можна зіграти 20 рук у кожному сценарії;
drill запускається і виходить по нормі; старий прогрес імпортується.

### Фаза 2 — бекенд: моделі + auth
- SQLAlchemy-моделі User/Attempt, перша Alembic-міграція.
- bcrypt (passlib) для паролів; JWT access-токен 24h у httpOnly+secure+samesite=lax cookie;
  залежність `get_current_user`.
- Роутер /auth повністю. Валідація: email формат, пароль 8+.
- pytest: register→login→me→logout, дубль email 409, невірний пароль 401,
  me без cookie 401.
- CORS: дозволити localhost:5173 і майбутній Vercel-домен, credentials=true.

**Готово, коли:** тести auth зелені; через httpie можна зареєструватись і отримати /me.

### Фаза 3 — журнал спроб + статистика
- POST /attempts/batch: ідемпотентність по (user_id, client_id) через
  `ON CONFLICT DO NOTHING`, повертати скільки прийнято/дублів. Ліміт 500 за батч.
- GET /stats/*: SQL-агрегації. /stats/scenario/{s} рахує позиції СУВОРО в межах
  сценарію. /stats/gate — rolling window останніх 150 спроб stage='pre'.
- pytest на агрегації: залити фікстуру спроб, звірити цифри руками.

**Готово, коли:** тести stats зелені, зокрема кейс «позиції не течуть між сценаріями».

### Фаза 4 — інтеграція клієнта
- Сторінка Login/Register; store auth зі станом user.
- Черга синку: кожна відповідь пише подію з client_id=uuid у localStorage-чергу;
  фоновий флашер шле батчі кожні 10 подій або 30с; при 401 — пауза до логіну;
  при офлайні — накопичення. Retry з backoff.
- Первинна міграція: при першому логіні запропонувати залити історію зі старого
  localStorage (лог помилок + recent) як attempts (client_id згенерувати детерміновано,
  щоб повторна міграція не дублювала).
- Вкладки Stats/Review переключити на серверні дані, з фолбеком на локальні,
  поки синк не догнав.

**Готово, коли:** логін у двох браузерах показує однакову статистику; вимкнення
мережі не ламає тренування, після відновлення черга доїжджає без дублів.

### Фаза 5 — деплой
- api: Dockerfile (multi-stage, uv), Railway-сервіс + Railway Postgres,
  міграції Alembic на старті (release command). Env: DATABASE_URL, JWT_SECRET,
  COOKIE_DOMAIN, CORS_ORIGINS.
- web: Vercel, env VITE_API_URL. 
- Cookie крос-доменно: якщо різні домени — samesite=none+secure; краще одразу
  повісити api на піддомен того ж домену.
- GitHub Actions: lint + тести обох частин на PR.
- Smoke-чеклист після деплою: register, 10 рук, перезайти з телефона, цифри збіглись.

**Готово, коли:** застосунок живе на публічному URL, повний цикл працює з мобільного.

### Фаза 6 — після MVP (не починати без окремого рішення)
- Постфлоп-етап (Етап 2 з HTML-версії) у engine + події stage='post'.
- Refresh-токени і ротація.
- Експорт звіту (той самий текстовий формат, що зараз у «Розборі»).
- Графік прогресу точності по тижнях.

## Технічні правила для Claude Code

- Python: type hints скрізь, ruff + ruff format; без зайвих абстракцій —
  роутер → сервіс-функція → запит, без репозиторіїв-на-виріст.
- TS: strict, без any; engine не імпортує нічого з React.
- Секрети тільки з env; .env.example підтримувати актуальним.
- Комміти по фазах або логічних шматках, формат: `phase-N: короткий опис`.
- Якщо рішення відхиляється від цього плану — спершу написати чому в PR-описі.
