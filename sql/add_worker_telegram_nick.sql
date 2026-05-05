alter table public.workers
  add column if not exists telegram_nick text;

update public.workers
set telegram_nick = nullif(regexp_replace(coalesce(telegram_nick, ''), '^@+', ''), '')
where telegram_nick is not null;
