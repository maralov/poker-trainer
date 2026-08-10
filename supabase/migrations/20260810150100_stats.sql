-- Агрегації.
--
-- Свідоме рішення (відхилення від списку /stats/* у PLAN.md): SQL робить лише
-- РАХУВАННЯ. Логіка воріт, drill-пулу і діагностики залишається в web/src/engine/,
-- де вона вже покрита тестами. Продублювати її тут означало б два джерела істини,
-- які неминуче розійдуться.
--
-- Усі функції — security invoker, тож RLS діє: користувач бачить лише свої дані.

-- Підсумки за весь час у розрізі сценарій × позиція.
-- Клієнт з цього збирає і зріз за сценаріями, і зріз за позиціями.
create or replace function public.stats_totals()
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
         count(*)                        as played,
         count(*) filter (where a.is_correct) as correct
  from public.attempts a
  where a.user_id = (select auth.uid())
    and a.stage = 'pre'
  group by a.scenario, a.hero_pos
$$;

comment on function public.stats_totals is
  'Лічильники зіграно/правильно за (сценарій, позиція). Позиції не течуть між сценаріями.';

-- Хвіст журналу для воріт: клієнт згодовує його gateStatus() з engine/.
-- limit параметром, щоб розмір вікна лишався визначеним в одному місці — у TS.
create or replace function public.recent_attempts(window_size integer default 150)
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
    order by answered_at desc, id desc
    limit least(greatest(window_size, 1), 1000)
  ) a
  order by a.answered_at asc, a.id asc
$$;

comment on function public.recent_attempts is
  'Останні N спроб префлопу у хронологічному порядку — вхід для gateStatus() з engine/.';

-- Помилки сценарію: вхід для drillPool() і buildReview() з engine/.
create or replace function public.mistakes(target_scenario text, max_rows integer default 500)
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
      and scenario = target_scenario
      and not is_correct
    order by answered_at desc, id desc
    limit least(greatest(max_rows, 1), 2000)
  ) a
  order by a.answered_at asc, a.id asc
$$;

comment on function public.mistakes is
  'Журнал помилок сценарію — вхід для drillPool() і buildReview() з engine/.';

-- Загальні цифри, які немає сенсу тягнути рядками: найдовша серія правильних.
create or replace function public.stats_summary()
returns table (
  total       bigint,
  correct     bigint,
  best_streak integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ordered as (
    select is_correct,
           -- Номер групи змінюється на кожній помилці: різниця двох нумерацій
           -- дає стабільний ідентифікатор серії правильних відповідей.
           row_number() over (order by answered_at, id)
             - row_number() over (partition by is_correct order by answered_at, id) as grp
    from public.attempts
    where user_id = (select auth.uid())
      and stage = 'pre'
  ),
  streaks as (
    select count(*) as len
    from ordered
    where is_correct
    group by grp
  )
  select
    (select count(*) from public.attempts
      where user_id = (select auth.uid()) and stage = 'pre')                       as total,
    (select count(*) from public.attempts
      where user_id = (select auth.uid()) and stage = 'pre' and is_correct)        as correct,
    coalesce((select max(len) from streaks), 0)::integer                            as best_streak
$$;

comment on function public.stats_summary is
  'Усього спроб, правильних і найдовша серія — рахується вікном по answered_at.';
