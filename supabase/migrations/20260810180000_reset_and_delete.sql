-- Скидання прогресу і видалення власних даних.
--
-- Початкова схема не мала ні DELETE, ні способу почати заново: журнал був
-- незмінним «навіть для власника». Для аудит-логу це правильно, але тут дані
-- належать користувачеві, і кнопка «Скинути прогрес» не мала чим працювати.
--
-- Тепер два різні механізми:
--   reset_progress()       — мітка часу, після якої ведеться лік. Журнал
--                            лишається append-only, скидання оборотне.
--   delete_all_progress()  — справжнє видалення, коли треба стерти назавжди.

create table public.user_settings (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- null означає «рахувати всю історію»
  reset_at   timestamptz,
  updated_at timestamptz not null default now()
);

comment on column public.user_settings.reset_at is
  'Мітка скидання: статистика рахує лише спроби, відповіді на які пізніші за неї.';

alter table public.user_settings enable row level security;

grant select, insert, update on public.user_settings to authenticated;
grant all on public.user_settings to service_role;

create policy "Користувач бачить лише свої налаштування"
  on public.user_settings for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Користувач створює лише свої налаштування"
  on public.user_settings for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Користувач змінює лише свої налаштування"
  on public.user_settings for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Право стерти власну історію. Незмінність журналу лишається в силі в тому
-- сенсі, що переписати окремий рядок не можна: UPDATE-політики як не було,
-- так і немає. Але видалити свої дані користувач має могти.
grant delete on public.attempts to authenticated;

create policy "Користувач видаляє лише свої спроби"
  on public.attempts for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ── функції ──────────────────────────────────────────────────────────────────

create or replace function public.current_reset_at()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select reset_at from public.user_settings where user_id = (select auth.uid())
$$;

create or replace function public.reset_progress()
returns timestamptz
language sql
volatile
security invoker
set search_path = ''
as $$
  insert into public.user_settings (user_id, reset_at, updated_at)
  values ((select auth.uid()), now(), now())
  on conflict (user_id) do update set reset_at = now(), updated_at = now()
  returning reset_at
$$;

comment on function public.reset_progress is
  'Ставить мітку скидання на поточний момент. Спроби не видаляються.';

create or replace function public.delete_all_progress()
returns bigint
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  removed bigint;
begin
  delete from public.attempts where user_id = (select auth.uid());
  get diagnostics removed = row_count;

  -- Після повного видалення мітка вже нічого не відсікає — прибираємо її,
  -- щоб наступні спроби рахувались з нуля, а не «після старої мітки».
  update public.user_settings
     set reset_at = null, updated_at = now()
   where user_id = (select auth.uid());

  return removed;
end
$$;

comment on function public.delete_all_progress is
  'Видаляє всі спроби користувача назавжди і знімає мітку скидання.';

-- ── агрегації: тепер рахують лише те, що після мітки ─────────────────────────

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
         count(*)                             as played,
         count(*) filter (where a.is_correct) as correct
  from public.attempts a
  where a.user_id = (select auth.uid())
    and a.stage = 'pre'
    and a.answered_at > coalesce(public.current_reset_at(), '-infinity'::timestamptz)
  group by a.scenario, a.hero_pos
$$;

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
      and answered_at > coalesce(public.current_reset_at(), '-infinity'::timestamptz)
    order by answered_at desc, id desc
    limit least(greatest(window_size, 1), 1000)
  ) a
  order by a.answered_at asc, a.id asc
$$;

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
      and answered_at > coalesce(public.current_reset_at(), '-infinity'::timestamptz)
    order by answered_at desc, id desc
    limit least(greatest(max_rows, 1), 2000)
  ) a
  order by a.answered_at asc, a.id asc
$$;

-- Сигнатура міняється (додається reset_at), а create or replace не вміє міняти
-- тип повернення — тому спершу прибираємо стару функцію.
drop function if exists public.stats_summary();

create function public.stats_summary()
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
           row_number() over (order by answered_at, id)
             - row_number() over (partition by is_correct order by answered_at, id) as grp
    from public.attempts, bounds
    where user_id = (select auth.uid())
      and stage = 'pre'
      and answered_at > bounds.since
  ),
  streaks as (
    select count(*) as len from counted where is_correct group by grp
  )
  select
    (select count(*) from public.attempts, bounds
      where user_id = (select auth.uid()) and stage = 'pre'
        and answered_at > bounds.since)                                   as total,
    (select count(*) from public.attempts, bounds
      where user_id = (select auth.uid()) and stage = 'pre' and is_correct
        and answered_at > bounds.since)                                   as correct,
    coalesce((select max(len) from streaks), 0)::integer                  as best_streak,
    (select marker from bounds)                                           as reset_at
$$;
