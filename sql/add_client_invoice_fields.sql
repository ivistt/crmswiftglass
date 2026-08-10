alter table public.clients
  add column if not exists alias text,
  add column if not exists requisites text;

update public.clients
set alias = name
where nullif(trim(coalesce(alias, '')), '') is null
  and nullif(trim(coalesce(name, '')), '') is not null;
