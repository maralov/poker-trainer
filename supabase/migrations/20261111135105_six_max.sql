-- 6-max поруч з 9-max (спека 2026-11-11-six-max-design.md).
--
-- Форма події та сама, змінюється лише значення: «UTG» у 6-max — інша рука
-- й інший діапазон, ніж у 9-max. Без мітки формату ворота, Stats і Review
-- змішали б два столи. Тому — колонка, а не окремі таблиці.
--
-- Наявні рядки стають 9-max через default: це не UPDATE з боку клієнта,
-- журнал лишається незмінним для власника.

-- ── формат у журналах ────────────────────────────────────────────────────────

alter table public.attempts
  add column table_size text not null default '9max'
    check (table_size in ('9max', '6max')),
  -- Позиції 6-max — підмножина 9-max. Подію «6-max з LJ» база відкидає,
  -- а не зберігає як сміття, яке потім тихо зіпсує зрізи.
  add constraint attempts_six_max_seats_check check (
    table_size <> '6max' or (
      hero_pos in ('UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB')
      and (villain_pos is null or villain_pos in ('UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'))
    )
  );

alter table public.postflop_attempts
  add column table_size text not null default '9max'
    check (table_size in ('9max', '6max')),
  add constraint postflop_attempts_six_max_seats_check check (
    table_size <> '6max' or hero_pos in ('UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB')
  );

comment on column public.attempts.table_size is
  'Формат столу, у якому зіграно спот: 9max або 6max.';
comment on column public.postflop_attempts.table_size is
  'Формат столу, у якому роздано епізод: 9max або 6max.';

-- ── скидання окремо на формат ────────────────────────────────────────────────
--
-- Одна мітка на користувача означала б: почав 6-max з нуля — втратив відкриті
-- ворота 9-max. Мітка тепер на пару (користувач, формат).

create table public.user_reset (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  table_size text not null check (table_size in ('9max', '6max')),
  reset_at   timestamptz not null,
  primary key (user_id, table_size)
);

comment on table public.user_reset is
  'Мітки скидання прогресу: статистика формату рахує лише спроби після мітки.';

alter table public.user_reset enable row level security;

-- delete — для delete_all_progress(): «стерти мене назавжди» знімає й мітки.
grant select, insert, update, delete on public.user_reset to authenticated;
grant all on public.user_reset to service_role;

create policy "Користувач бачить лише свої мітки скидання"
  on public.user_reset for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Користувач створює лише свої мітки скидання"
  on public.user_reset for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Користувач змінює лише свої мітки скидання"
  on public.user_reset for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Користувач видаляє лише свої мітки скидання"
  on public.user_reset for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Наявна мітка належала 9-max — іншого формату тоді не існувало.
-- user_settings.reset_at лишається, щоб клієнт до деплою не зламався,
-- але більше ніде не читається.
insert into public.user_reset (user_id, table_size, reset_at)
select user_id, '9max', reset_at
from public.user_settings
where reset_at is not null;

-- ── функції скидання ─────────────────────────────────────────────────────────
--
-- Старі сигнатури прибираються: виклик без формату — помилка, а не тиха
-- статистика «якогось» столу.

drop function if exists public.stats_totals();
drop function if exists public.recent_attempts(integer);
drop function if exists public.mistakes(text, integer);
drop function if exists public.stats_summary();
drop function if exists public.postflop_totals();
drop function if exists public.postflop_summary();
drop function if exists public.postflop_mistakes(integer);
drop function if exists public.postflop_drill_tail(integer);
drop function if exists public.reset_progress();
drop function if exists public.current_reset_at();

create function public.current_reset_at(target_table text)
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select reset_at
  from public.user_reset
  where user_id = (select auth.uid()) and table_size = target_table
$$;

create function public.reset_progress(target_table text)
returns timestamptz
language sql
volatile
security invoker
set search_path = ''
as $$
  insert into public.user_reset (user_id, table_size, reset_at)
  values ((select auth.uid()), target_table, now())
  on conflict (user_id, table_size) do update set reset_at = now()
  returning reset_at
$$;

comment on function public.reset_progress is
  'Ставить мітку скидання формату на поточний момент. Спроби не видаляються.';

create or replace function public.delete_all_progress()
returns bigint
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  removed_pre  bigint;
  removed_post bigint;
begin
  delete from public.attempts where user_id = (select auth.uid());
  get diagnostics removed_pre = row_count;

  delete from public.postflop_attempts where user_id = (select auth.uid());
  get diagnostics removed_post = row_count;

  -- Після повного видалення мітки вже нічого не відсікають — прибираємо їх,
  -- щоб наступні спроби рахувались з нуля, а не «після старої мітки».
  delete from public.user_reset where user_id = (select auth.uid());
  update public.user_settings
     set reset_at = null, updated_at = now()
   where user_id = (select auth.uid());

  return removed_pre + removed_post;
end
$$;

comment on function public.delete_all_progress is
  'Видаляє всі спроби користувача в усіх форматах і знімає мітки скидання.';

-- ── префлоп ──────────────────────────────────────────────────────────────────

create function public.stats_totals(target_table text)
returns table (
  scenario text,
  hero_pos text,
  played   bigint,
  correct  bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.scenario,
         a.hero_pos,
         count(*)                             as played,
         count(*) filter (where a.is_correct) as correct
  from public.attempts a
  where a.user_id = (select auth.uid())
    and a.stage = 'pre'
    and a.table_size = target_table
    and a.answered_at > coalesce(public.current_reset_at(target_table), '-infinity'::timestamptz)
  group by a.scenario, a.hero_pos
$$;

create function public.recent_attempts(target_table text, window_size integer default 150)
returns table (
  scenario   text,
  hero_pos   text,
  is_correct boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.scenario, a.hero_pos, a.is_correct
  from (
    select *
    from public.attempts
    where user_id = (select auth.uid())
      and stage = 'pre'
      and table_size = target_table
      and answered_at > coalesce(public.current_reset_at(target_table), '-infinity'::timestamptz)
    order by answered_at desc, id desc
    limit least(greatest(window_size, 1), 1000)
  ) a
  order by a.answered_at asc, a.id asc
$$;

create function public.mistakes(
  target_table    text,
  target_scenario text,
  max_rows        integer default 500
)
returns table (
  scenario    text,
  hero_pos    text,
  hand        text,
  chosen      text,
  correct     text,
  answered_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.scenario, a.hero_pos, a.hand, a.chosen, a.correct, a.answered_at
  from (
    select *
    from public.attempts
    where user_id = (select auth.uid())
      and stage = 'pre'
      and table_size = target_table
      and scenario = target_scenario
      and not is_correct
      and answered_at > coalesce(public.current_reset_at(target_table), '-infinity'::timestamptz)
    order by answered_at desc, id desc
    limit least(greatest(max_rows, 1), 2000)
  ) a
  order by a.answered_at asc, a.id asc
$$;

create function public.stats_summary(target_table text)
returns table (
  total       bigint,
  correct     bigint,
  best_streak integer,
  reset_at    timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select coalesce(public.current_reset_at(target_table), '-infinity'::timestamptz) as since,
           public.current_reset_at(target_table)                                     as marker
  ),
  game as (
    select a.id, a.answered_at, a.is_correct
    from public.attempts a, bounds
    where a.user_id = (select auth.uid())
      and a.stage = 'pre'
      and a.table_size = target_table
      and a.answered_at > bounds.since
  ),
  counted as (
    select is_correct,
           row_number() over (order by answered_at, id)
             - row_number() over (partition by is_correct order by answered_at, id) as grp
    from game
  ),
  streaks as (
    select count(*) as len from counted where is_correct group by grp
  )
  select
    (select count(*) from game)                          as total,
    (select count(*) from game where is_correct)         as correct,
    coalesce((select max(len) from streaks), 0)::integer as best_streak,
    (select marker from bounds)                          as reset_at
$$;

-- ── постфлоп ─────────────────────────────────────────────────────────────────

create function public.postflop_totals(target_table text)
returns table (
  dimension text,
  bucket    text,
  played    bigint,
  correct   bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with rows as (
    select *
    from public.postflop_attempts
    where user_id = (select auth.uid())
      and not is_drill
      and table_size = target_table
      and answered_at > coalesce(public.current_reset_at(target_table), '-infinity'::timestamptz)
  )
  select 'street', street, count(*), count(*) filter (where is_correct) from rows group by street
  union all
  select 'category', category, count(*), count(*) filter (where is_correct) from rows group by category
  union all
  select 'texture', texture, count(*), count(*) filter (where is_correct) from rows group by texture
  union all
  select 'facing', facing, count(*), count(*) filter (where is_correct) from rows group by facing
  union all
  -- Ключ режиму збігається з локальним postModeKey: роздільник — U+00B7.
  select 'mode',
         (case when n_opps >= 2 then 'MULTI' else 'HU' end) || '·' ||
         (case when ip then 'IP' else 'OOP' end),
         count(*), count(*) filter (where is_correct)
  from rows
  group by 2
$$;

create function public.postflop_summary(target_table text)
returns table (
  total       bigint,
  correct     bigint,
  best_streak integer,
  reset_at    timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select coalesce(public.current_reset_at(target_table), '-infinity'::timestamptz) as since,
           public.current_reset_at(target_table)                                     as marker
  ),
  game as (
    select a.id, a.answered_at, a.is_correct
    from public.postflop_attempts a, bounds
    where a.user_id = (select auth.uid())
      and not a.is_drill
      and a.table_size = target_table
      and a.answered_at > bounds.since
  ),
  counted as (
    select is_correct,
           row_number() over (order by answered_at, id)
             - row_number() over (partition by is_correct order by answered_at, id) as grp
    from game
  ),
  streaks as (
    select count(*) as len from counted where is_correct group by grp
  )
  select
    (select count(*) from game)                          as total,
    (select count(*) from game where is_correct)         as correct,
    coalesce((select max(len) from streaks), 0)::integer as best_streak,
    (select marker from bounds)                          as reset_at
$$;

create function public.postflop_mistakes(target_table text, max_rows integer default 500)
returns table (
  episode_id  uuid,
  line        text,
  street      text,
  board       text,
  hand        text,
  category    text,
  texture     text,
  facing      text,
  n_opps      smallint,
  ip          boolean,
  chosen      text,
  correct     text,
  is_drill    boolean,
  answered_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.episode_id, a.line, a.street, a.board, a.hand, a.category, a.texture,
         a.facing, a.n_opps, a.ip, a.chosen, a.correct, a.is_drill, a.answered_at
  from (
    select *
    from public.postflop_attempts
    where user_id = (select auth.uid())
      and not is_correct
      and table_size = target_table
      and answered_at > coalesce(public.current_reset_at(target_table), '-infinity'::timestamptz)
    order by answered_at desc, id desc
    limit least(greatest(max_rows, 1), 2000)
  ) a
  order by a.answered_at asc, a.id asc
$$;

comment on function public.postflop_mistakes is
  'Журнал помилок Етапу 2 формату зі спотом і позначкою drill — вхід для розбору й пулу drill в engine/.';

create function public.postflop_drill_tail(target_table text, max_rows integer default 500)
returns table (
  drill_fix   text,
  is_correct  boolean,
  answered_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.drill_fix, a.is_correct, a.answered_at
  from (
    select *
    from public.postflop_attempts
    where user_id = (select auth.uid())
      and is_drill
      and table_size = target_table
      and answered_at > coalesce(public.current_reset_at(target_table), '-infinity'::timestamptz)
    order by answered_at desc, id desc
    limit least(greatest(max_rows, 1), 2000)
  ) a
  order by a.answered_at asc, a.id asc
$$;

comment on function public.postflop_drill_tail is
  'Останні drill-відповіді Етапу 2 формату у хронологічному порядку — вхід для серій drill в engine/.';
