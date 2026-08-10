alter table public.orders
  add column if not exists license_plate text;
