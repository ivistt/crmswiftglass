alter table public.orders
  add column if not exists tatu_status boolean not null default false,
  add column if not exists toning_status boolean not null default false;

update public.orders
set
  tatu_status = coalesce(tatu_status, false),
  toning_status = coalesce(toning_status, false);
