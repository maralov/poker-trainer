-- Журнал постфлопу (Етап 2).
--
-- Окрема таблиця, а не нові колонки в attempts: форма події інша (вулиця, борд,
-- контекст рішення), а префлопний журнал не хочеться чіпати міграцією.
--
-- Принцип той самий: сирі події, не агрегати. Один рядок — ОДНЕ рішення героя;
-- episode_id лише групує рішення однієї роздачі для розбору, це звʼязка, а не
-- лічильник.

create table public.postflop_attempts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id   text not null,

  -- Спільний для всіх рішень однієї роздачі.
  episode_id  uuid not null,

  line        text not null check (line in ('aggressor', 'caller')),
  -- Префлоп-контекст, з якого виріс постфлоп.
  scenario    text not null check (scenario in ('rfi', 'iso', 'vsraise')),

  hero_pos    text not null check (hero_pos in ('UTG','UTG+1','MP','LJ','HJ','CO','BTN','SB','BB')),
  -- Позиції опонентів роздачі через кому: 'BB' або 'BTN,BB'. Разом із board,
  -- facing і pot_bb дає повне відтворення споту для майбутнього drill.
  -- Це опоненти РОЗДАЧІ, а не ті, хто лишився: n_opps рахує активних на момент
  -- рішення, тож після фолду в мультивеї числа навмисно різні.
  opp_pos     text not null,
  n_opps      smallint not null check (n_opps between 1 and 3),
  ip          boolean not null,

  street      text not null check (street in ('flop', 'turn', 'river')),
  board       text not null check (board ~ '^([AKQJT98765432][shdc]){3,5}$'),
  hand        text not null check (hand ~ '^[AKQJT98765432]{2}[so]?$'),
  hole        text not null check (hole ~ '^([AKQJT98765432][shdc]){2}$'),

  category    text not null check (category in
    ('STRONG_MADE','STRONG_PAIR','MEDIUM','WEAK','DRAW','WEAKDRAW','AIR')),
  -- Текстура флопу; події пізніх вулиць відтворюються з board.
  texture     text not null check (texture in ('DRY', 'WET', 'PAIRED')),
  facing      text not null check (facing in ('none', 'small_bet', 'big_bet', 'raise')),
  repeat_aggro boolean not null default false,
  pot_bb      numeric not null check (pot_bb > 0),

  chosen      text not null check (chosen in ('check','b33','b66','fold','call','raise')),
  correct     text not null check (correct in ('check','b33','b66','fold','call','raise')),
  -- Похідне поле, але генероване базою: клієнт не може надіслати is_correct,
  -- що суперечить парі (chosen, correct).
  is_correct  boolean not null generated always as (chosen = correct) stored,

  answered_at timestamptz not null,
  created_at  timestamptz not null default now(),

  constraint postflop_attempts_user_client_key unique (user_id, client_id)
);

comment on table public.postflop_attempts is
  'Сирі події Етапу 2. Один рядок — одне рішення героя; episode_id групує роздачу.';
comment on column public.postflop_attempts.episode_id is
  'Ідентифікатор роздачі: звʼязує рішення флопу, терну й рівера однієї руки.';
comment on column public.postflop_attempts.opp_pos is
  'Позиції опонентів роздачі через кому. n_opps — активні на момент рішення.';

create index postflop_attempts_user_answered_idx
  on public.postflop_attempts (user_id, answered_at desc);
create index postflop_attempts_user_street_answered_idx
  on public.postflop_attempts (user_id, street, answered_at desc);
create index postflop_attempts_user_episode_idx
  on public.postflop_attempts (user_id, episode_id);
create index postflop_attempts_user_mistakes_idx
  on public.postflop_attempts (user_id, answered_at desc)
  where not is_correct;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Anon-ключ публічний за визначенням, тож ізоляція користувачів тримається
-- виключно на цих політиках. GRANT і RLS — різні механізми, потрібні обидва.

alter table public.postflop_attempts enable row level security;

grant select, insert, delete on public.postflop_attempts to authenticated;
grant all on public.postflop_attempts to service_role;

create policy "Користувач бачить лише свої постфлоп-спроби"
  on public.postflop_attempts for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Користувач пише лише свої постфлоп-спроби"
  on public.postflop_attempts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- DELETE потрібен для «видалити все назавжди»; UPDATE-політики немає навмисно:
-- переписати окремий рядок журналу не може навіть його власник.
create policy "Користувач видаляє лише свої постфлоп-спроби"
  on public.postflop_attempts for delete
  to authenticated
  using ((select auth.uid()) = user_id);
