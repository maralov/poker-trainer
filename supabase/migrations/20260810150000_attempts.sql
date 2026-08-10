-- Журнал спроб.
--
-- Принцип із PLAN.md: сирі події, не агрегати. Кожна відповідь — окремий рядок.
-- Жодних лічильників типу byPos у базі: статистика, ворота і drill-пули — похідні.
--
-- Своєї таблиці users немає: ідентичність тримає auth.users (Supabase Auth).

create table public.attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,

  -- uuid з клієнта: робить синк ідемпотентним (див. unique нижче)
  client_id   text not null,

  stage       text not null default 'pre' check (stage in ('pre', 'post')),
  scenario    text not null check (scenario in ('rfi', 'iso', 'vsraise', 'vs3bet')),
  -- Назва hero_pos, а не position: position — зарезервоване слово SQL, через яке
  -- воно не проходить у returns table і всюди вимагало б лапок. Заодно стає в пару
  -- до villain_pos.
  hero_pos    text not null check (hero_pos in ('UTG','UTG+1','MP','LJ','HJ','CO','BTN','SB','BB')),
  hand        text not null check (hand ~ '^[AKQJT98765432]{2}[so]?$'),

  -- Опенер для vsraise, 3-бетор для vs3bet; для rfi та iso — null.
  villain_pos text check (villain_pos in ('UTG','UTG+1','MP','LJ','HJ','CO','BTN','SB','BB')),
  -- Кількість лімперів для iso: від неї залежить, чи береться звужений діапазон.
  limpers     smallint check (limpers between 0 and 8),

  chosen      text not null check (chosen in ('raise', 'call', 'fold')),
  correct     text not null check (correct in ('raise', 'call', 'fold')),
  -- Похідне поле, але генероване базою: клієнт не може надіслати is_correct,
  -- що суперечить парі (chosen, correct).
  is_correct  boolean not null generated always as (chosen = correct) stored,

  is_drill    boolean not null default false,
  is_control  boolean not null default false,

  -- Час на клієнті: саме він задає порядок у ковзному вікні воріт.
  answered_at timestamptz not null,
  created_at  timestamptz not null default now(),

  constraint attempts_user_client_key unique (user_id, client_id)
);

comment on table public.attempts is
  'Сирі події тренування. Одна відповідь — один рядок; агрегати не зберігаються.';
comment on column public.attempts.client_id is
  'uuid, згенерований клієнтом. Разом з user_id дає ідемпотентність повторного синку.';
comment on column public.attempts.villain_pos is
  'Опенер для vsraise, 3-бетор для vs3bet. Потрібен, щоб drill відтворив точний спот.';

-- Ковзне вікно воріт і drill-пул читають хвіст журналу за часом відповіді.
create index attempts_user_answered_idx
  on public.attempts (user_id, answered_at desc);
create index attempts_user_scenario_answered_idx
  on public.attempts (user_id, scenario, answered_at desc);
-- Пул «ліків» — лише помилки конкретного сценарію.
create index attempts_user_mistakes_idx
  on public.attempts (user_id, scenario, answered_at desc)
  where not is_correct;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Anon-ключ публічний за визначенням, тож ізоляція користувачів тримається
-- виключно на цих політиках. Вони — головна поверхня безпеки застосунку
-- і покриті тестами в supabase/tests.

alter table public.attempts enable row level security;

-- GRANT і RLS — різні механізми, і потрібні обидва: без табличних привілеїв
-- PostgREST відповідає «permission denied» ще до того, як дійде до політик.
-- anon не отримує нічого навмисно: без входу застосунок працює локально.
grant select, insert on public.attempts to authenticated;

-- service_role — ключ, який ніколи не потрапляє в браузер (обслуговування,
-- видалення акаунта, тести). Незмінність журналу — гарантія для користувача,
-- не для оператора бази.
grant all on public.attempts to service_role;

create policy "Користувач бачить лише свої спроби"
  on public.attempts for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Користувач пише лише свої спроби"
  on public.attempts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- UPDATE і DELETE політик не мають навмисно: журнал подій незмінний.
-- Переписати історію не може навіть його власник.
