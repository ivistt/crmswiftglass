alter table public.orders
  add column if not exists extra_assistant text,
  add column if not exists extra_assistant_worker_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_extra_assistant_worker_id_fkey'
  ) then
    alter table public.orders
      add constraint orders_extra_assistant_worker_id_fkey
      foreign key (extra_assistant_worker_id) references public.workers(id);
  end if;
end $$;

create index if not exists idx_orders_extra_assistant on public.orders(extra_assistant);
create index if not exists idx_orders_extra_assistant_worker_id on public.orders(extra_assistant_worker_id);
