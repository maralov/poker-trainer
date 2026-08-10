-- Виконується один раз при створенні тому postgres.
-- citext потрібен для case-insensitive UNIQUE на email, pgcrypto — для gen_random_uuid().
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Окрема база для тестів: pytest не має чіпати дані розробки.
CREATE DATABASE poker_trainer_test OWNER poker;
\connect poker_trainer_test
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
