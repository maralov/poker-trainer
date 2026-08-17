-- Зрізи Етапу 2.
--
-- SQL рахує, TS вирішує: тут лише GROUP BY. Патерни помилок і діагностика
-- лишаються в web/src/engine/, інакше джерел істини стало б два (правило 4).
--
-- Мітка скидання діє так само, як у префлопі: рахується лише те, що після неї.

-- Пʼять зрізів одним запитом: клієнт розкладає їх у PostProgress.
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

comment on function public.postflop_totals is
  'Зіграно/правильно за пʼятьма зрізами Етапу 2 одним запитом.';

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
  counted as (
    select is_correct,
           -- Номер групи змінюється на кожній помилці: різниця двох нумерацій
           -- дає стабільний ідентифікатор серії правильних відповідей.
           row_number() over (order by answered_at, id)
             - row_number() over (partition by is_correct order by answered_at, id) as grp
    from public.postflop_attempts, bounds
    where user_id = (select auth.uid())
      and answered_at > bounds.since
  ),
  streaks as (
    select count(*) as len from counted where is_correct group by grp
  )
  select
    (select count(*) from public.postflop_attempts, bounds
      where user_id = (select auth.uid()) and answered_at > bounds.since)               as total,
    (select count(*) from public.postflop_attempts, bounds
      where user_id = (select auth.uid()) and is_correct and answered_at > bounds.since) as correct,
    coalesce((select max(len) from streaks), 0)::integer                                 as best_streak,
    (select marker from bounds)                                                          as reset_at
$$;

comment on function public.postflop_summary is
  'Усього рішень, правильних і найдовша серія Етапу 2 — з урахуванням мітки скидання.';

create or replace function public.postflop_mistakes(max_rows integer default 500)
returns table (
  street      text,
  category    text,
  texture     text,
  facing      text,
  n_opps      smallint,
  ip          boolean,
  chosen      text,
  correct     text,
  answered_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.street, a.category, a.texture, a.facing, a.n_opps, a.ip,
         a.chosen, a.correct, a.answered_at
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
  'Журнал помилок Етапу 2 — вхід для розбору в engine/.';
