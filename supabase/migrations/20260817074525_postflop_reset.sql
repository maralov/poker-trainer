-- «Видалити все назавжди» має стирати обидва журнали.
--
-- reset_progress() чіпати не треба: він лише ставить мітку часу, а всі
-- постфлоп-зрізи вже читають її через current_reset_at().

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

  -- Після повного видалення мітка вже нічого не відсікає — прибираємо її,
  -- щоб наступні спроби рахувались з нуля, а не «після старої мітки».
  update public.user_settings
     set reset_at = null, updated_at = now()
   where user_id = (select auth.uid());

  return removed_pre + removed_post;
end
$$;

comment on function public.delete_all_progress is
  'Видаляє всі спроби користувача — префлоп і постфлоп — і знімає мітку скидання.';
