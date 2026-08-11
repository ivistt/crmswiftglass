alter table public.cash_log
  add column if not exists approval_at timestamptz;

notify pgrst, 'reload schema';
