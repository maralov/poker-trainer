-- Drill по постфлоп-помилках (спека 2026-11-10-postflop-drill-design.md).
--
-- Drill-рішення — такі самі сирі події, як і звичайні, лише з позначкою і
-- патерном, який тренувався. Серії й закриття патернів рахує engine з хвоста
-- цих подій (правило 4 CLAUDE.md): SQL лише фільтрує і віддає рядки.

alter table public.postflop_attempts
  add column is_drill  boolean not null default false,
  -- Ключ PostFixKey з engine/postflop/postReview.ts. Перелік дублюється тут
  -- навмисно, як і решта check-обмежень: це валідація на межі довіри.
  add column drill_fix text check (drill_fix in (
    'bluffMulti', 'bluffWet', 'bluffOOP', 'thinBet', 'weakBet', 'missValue',
    'sizeSmall', 'sizeBig', 'barrelNoEquity', 'riverBluff', 'stackOnePair',
    'foldStrength', 'foldTooTight', 'callTooWide', 'raiseIntoStrength'
  )),
  add constraint postflop_attempts_drill_marked_check
    check (is_drill = (drill_fix is not null));

comment on column public.postflop_attempts.drill_fix is
  'Патерн, який тренував drill. Є лише в drill-рішень.';

create index postflop_attempts_user_drill_idx
  on public.postflop_attempts (user_id, answered_at desc)
  where is_drill;

-- Зрізи й підсумок — лише звичайні роздачі: drill крутить один патерн
-- підряд, і зрізи показували б drill, а не гру.

create or replace function public.postflop_totals()
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
      and answered_at > coalesce(public.current_reset_at(), '-infinity'::timestamptz)
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

create or replace function public.postflop_summary()
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
    select coalesce(public.current_reset_at(), '-infinity'::timestamptz) as since,
           public.current_reset_at()                                     as marker
  ),
  game as (
    select a.id, a.answered_at, a.is_correct
    from public.postflop_attempts a, bounds
    where a.user_id = (select auth.uid())
      and not a.is_drill
      and a.answered_at > bounds.since
  ),
  counted as (
    select is_correct,
           -- Номер групи змінюється на кожній помилці: різниця двох нумерацій
           -- дає стабільний ідентифікатор серії правильних відповідей.
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

-- Журнал помилок віддає і drill-помилки (їх бачить розбір), але з позначкою:
-- пул drill рахує лише звичайні. Тип повернення змінюється — тому drop.
drop function if exists public.postflop_mistakes(integer);

create function public.postflop_mistakes(max_rows integer default 500)
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
      and answered_at > coalesce(public.current_reset_at(), '-infinity'::timestamptz)
    order by answered_at desc, id desc
    limit least(greatest(max_rows, 1), 2000)
  ) a
  order by a.answered_at asc, a.id asc
$$;

comment on function public.postflop_mistakes is
  'Журнал помилок Етапу 2 зі спотом і позначкою drill — вхід для розбору й пулу drill в engine/.';

-- Хвіст drill-відповідей: з нього engine відтворює серії й закриття патернів.
create function public.postflop_drill_tail(max_rows integer default 500)
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
      and answered_at > coalesce(public.current_reset_at(), '-infinity'::timestamptz)
    order by answered_at desc, id desc
    limit least(greatest(max_rows, 1), 2000)
  ) a
  order by a.answered_at asc, a.id asc
$$;

comment on function public.postflop_drill_tail is
  'Останні drill-відповіді Етапу 2 у хронологічному порядку — вхід для серій drill в engine/.';
