-- Розбір постфлопу: журнал помилок носить спот, і роздачу можна розгорнути.
--
-- Досі `postflop_mistakes` віддавав лише виміри рішення (вулиця, категорія,
-- текстура, контекст). Для розбору цього мало: учень бачив «сильна пара на
-- терні», але не бачив, ЯКА це була рука і що сталося в роздачі далі. Тому
-- зріз додає episode_id/board/hand/line, а нова функція віддає всі рішення
-- однієї роздачі.
--
-- SQL і тут лише вибирає рядки: класифікація патернів лишається в TS
-- (правило 4 CLAUDE.md).

-- Набір колонок змінюється, а `create or replace` тип повернення міняти не
-- дає — тому функція спершу знімається. Дані від цього не страждають: вона
-- лише читає журнал.
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
  answered_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.episode_id, a.line, a.street, a.board, a.hand, a.category, a.texture,
         a.facing, a.n_opps, a.ip, a.chosen, a.correct, a.answered_at
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
  'Журнал помилок Етапу 2 разом зі спотом (роздача, борд, рука) — вхід для розбору в engine/.';

-- Одна роздача цілком: усі рішення героя в порядку, у якому він їх приймав.
-- Мітка скидання тут свідомо НЕ застосовується: це перегляд конкретної руки на
-- запит, а не статистика — сховати вже показану в розборі роздачу було б дивно.
create or replace function public.postflop_episode(episode uuid)
returns table (
  street       text,
  board        text,
  hand         text,
  hole         text,
  category     text,
  texture      text,
  facing       text,
  repeat_aggro boolean,
  pot_bb       numeric,
  chosen       text,
  correct      text,
  is_correct   boolean,
  answered_at  timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.street, a.board, a.hand, a.hole, a.category, a.texture, a.facing,
         a.repeat_aggro, a.pot_bb, a.chosen, a.correct, a.is_correct, a.answered_at
  from public.postflop_attempts a
  where a.user_id = (select auth.uid())
    and a.episode_id = episode
  order by a.answered_at asc, a.id asc
$$;

comment on function public.postflop_episode is
  'Усі рішення однієї роздачі Етапу 2 — для розгортання руки в Розборі.';
