-- Сценарій «проти 4-бету»: герой 3-бетив, опенер відповів 4-бетом.
-- Новий рядок журналу з scenario = 'vs4bet' без цього відкидав би check,
-- і черга синку застрягла б на ньому назавжди.
-- Назва — та, що Postgres дав інлайн-check'у колонки в 20260810150000_attempts.sql.
alter table public.attempts
  drop constraint attempts_scenario_check,
  add constraint attempts_scenario_check
    check (scenario in ('rfi', 'iso', 'vsraise', 'vs3bet', 'vs4bet'));
