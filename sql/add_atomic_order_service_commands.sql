-- Атомарные команды для заполнения цены услуги и завершения тату/тонировки.
-- Сначала выполнить этот файл в Supabase SQL Editor, затем публиковать Worker.

alter table public.orders
  add column if not exists service_price_audit jsonb not null default '{}'::jsonb,
  add column if not exists tatu_completed_at timestamptz,
  add column if not exists tatu_completed_by_worker_id uuid references public.workers(id),
  add column if not exists tatu_salary_amount numeric,
  add column if not exists tatu_salary_rate numeric,
  add column if not exists toning_completed_at timestamptz,
  add column if not exists toning_completed_by_worker_id uuid references public.workers(id),
  add column if not exists toning_salary_amount numeric,
  add column if not exists toning_salary_rate numeric;

create table if not exists public.order_service_salary_events (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  service_code text not null check (service_code in ('tatu', 'toning')),
  worker_id uuid not null references public.workers(id),
  worker_name text not null,
  service_price numeric not null,
  salary_rate numeric not null,
  salary_amount numeric not null,
  completed_by_worker_id uuid references public.workers(id),
  completed_by text,
  completed_at timestamptz not null default now(),
  unique (order_id, service_code)
);

create index if not exists order_service_salary_events_worker_idx
  on public.order_service_salary_events (worker_id, completed_at desc);

-- Старые выполненные услуги считаем уже обработанными. Это не создаёт повторную ЗП.
update public.orders
set
  tatu_status = true,
  tatu_done = true,
  tatu_completed_at = now()
where (coalesce(tatu_done, false) is true or coalesce(tatu_status, false) is true)
  and tatu_completed_at is null;

update public.orders
set
  toning_status = true,
  toning_done = true,
  toning_completed_at = now()
where (coalesce(toning_done, false) is true or coalesce(toning_status, false) is true)
  and toning_completed_at is null;

create or replace function public.crm_set_missing_order_service_price(
  p_order_id text,
  p_service_code text,
  p_amount numeric,
  p_actor_worker_id uuid,
  p_actor_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_current numeric;
  v_total numeric;
  v_code text := lower(trim(coalesce(p_service_code, '')));
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Цена должна быть больше нуля';
  end if;

  if v_code not in ('mount', 'molding', 'extra_work', 'tatu', 'toning') then
    raise exception 'Неизвестная услуга';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Заказ не найден';
  end if;

  v_current := case v_code
    when 'mount' then coalesce(v_order.mount, 0)
    when 'molding' then coalesce(v_order.molding, 0)
    when 'extra_work' then coalesce(v_order.extra_work, 0)
    when 'tatu' then coalesce(v_order.tatu, 0)
    when 'toning' then coalesce(v_order.toning, 0)
  end;

  -- Идемпотентность: повтор с той же суммой безопасен, изменение уже заданной цены запрещено.
  if v_current > 0 then
    if v_current = p_amount then
      return to_jsonb(v_order);
    end if;
    raise exception 'Цена уже установлена';
  end if;

  update public.orders
  set
    mount = case when v_code = 'mount' then p_amount else mount end,
    molding = case when v_code = 'molding' then p_amount else molding end,
    extra_work = case when v_code = 'extra_work' then p_amount else extra_work end,
    tatu = case when v_code = 'tatu' then p_amount else tatu end,
    toning = case when v_code = 'toning' then p_amount else toning end,
    service_price_audit = coalesce(service_price_audit, '{}'::jsonb) || jsonb_build_object(
      v_code,
      jsonb_build_object(
        'amount', p_amount,
        'set_at', now(),
        'set_by_worker_id', p_actor_worker_id,
        'set_by', coalesce(p_actor_name, '')
      )
    )
  where id = p_order_id
  returning * into v_order;

  v_total := coalesce(v_order.mount, 0)
    + coalesce(v_order.molding, 0)
    + coalesce(v_order.extra_work, 0)
    + coalesce(v_order.tatu, 0)
    + coalesce(v_order.toning, 0);

  update public.orders
  set
    total = v_total,
    payment_status = case
      when coalesce(debt, 0) <= 0 then 'Не оплачено'
      when v_total + coalesce(income, 0) + coalesce(delivery, 0) > 0
        and coalesce(debt, 0) >= v_total + coalesce(income, 0) + coalesce(delivery, 0)
        then 'Оплачено'
      else 'Частично'
    end
  where id = p_order_id
  returning * into v_order;

  return to_jsonb(v_order);
end;
$$;

create or replace function public.crm_complete_order_special_service(
  p_order_id text,
  p_service_code text,
  p_actor_worker_id uuid,
  p_actor_name text,
  p_target_worker_id uuid,
  p_target_worker_name text,
  p_rate numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_salary public.worker_salaries%rowtype;
  v_event public.order_service_salary_events%rowtype;
  v_code text := lower(trim(coalesce(p_service_code, '')));
  v_price numeric;
  v_bonus numeric;
  v_already_completed boolean;
  v_salary_json jsonb := null;
begin
  if v_code not in ('tatu', 'toning') then
    raise exception 'Неизвестная специальная услуга';
  end if;
  if p_target_worker_id is null or nullif(trim(coalesce(p_target_worker_name, '')), '') is null then
    raise exception 'Не назначен ответственный сотрудник';
  end if;
  if p_rate is null or p_rate <= 0 then
    raise exception 'У ответственного сотрудника не настроен процент услуги';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Заказ не найден';
  end if;
  if coalesce(v_order.is_cancelled, false) then
    raise exception 'Заказ отменён';
  end if;

  v_price := case v_code
    when 'tatu' then coalesce(v_order.tatu, 0)
    when 'toning' then coalesce(v_order.toning, 0)
  end;
  if v_price <= 0 then
    raise exception 'Сначала укажите цену услуги';
  end if;
  if v_code = 'toning' and coalesce(v_order.toning_external, false) then
    raise exception 'Внешняя тонировка не начисляется сотруднику';
  end if;

  v_already_completed := case v_code
    when 'tatu' then v_order.tatu_completed_at is not null
    when 'toning' then v_order.toning_completed_at is not null
  end;

  if v_already_completed then
    return jsonb_build_object('order', to_jsonb(v_order), 'salary', null, 'already_completed', true);
  end if;

  select * into v_event
  from public.order_service_salary_events
  where order_id = p_order_id
    and service_code = v_code
  limit 1;
  if found then
    if v_code = 'tatu' then
      update public.orders
      set
        tatu_status = true,
        tatu_done = true,
        tatu_done_by = coalesce(v_event.completed_by, p_actor_name),
        tatu_responsible_worker_id = v_event.worker_id,
        tatu_completed_at = v_event.completed_at,
        tatu_completed_by_worker_id = v_event.completed_by_worker_id,
        tatu_salary_amount = v_event.salary_amount,
        tatu_salary_rate = v_event.salary_rate
      where id = p_order_id
      returning * into v_order;
    else
      update public.orders
      set
        toning_status = true,
        toning_done = true,
        toning_done_by = coalesce(v_event.completed_by, p_actor_name),
        toning_responsible_worker_id = v_event.worker_id,
        toning_completed_at = v_event.completed_at,
        toning_completed_by_worker_id = v_event.completed_by_worker_id,
        toning_salary_amount = v_event.salary_amount,
        toning_salary_rate = v_event.salary_rate
      where id = p_order_id
      returning * into v_order;
    end if;
    return jsonb_build_object('order', to_jsonb(v_order), 'salary', null, 'already_completed', true);
  end if;

  v_bonus := round(v_price * p_rate);
  if v_bonus <= 0 then
    raise exception 'Начисление получилось нулевым';
  end if;

  if v_code = 'tatu' then
    update public.orders
    set
      tatu_status = true,
      tatu_done = true,
      tatu_done_by = p_actor_name,
      tatu_responsible_worker_id = p_target_worker_id,
      tatu_completed_at = now(),
      tatu_completed_by_worker_id = p_actor_worker_id,
      tatu_salary_amount = v_bonus,
      tatu_salary_rate = p_rate
    where id = p_order_id
    returning * into v_order;
  else
    update public.orders
    set
      toning_status = true,
      toning_done = true,
      toning_done_by = p_actor_name,
      toning_responsible_worker_id = p_target_worker_id,
      toning_completed_at = now(),
      toning_completed_by_worker_id = p_actor_worker_id,
      toning_salary_amount = v_bonus,
      toning_salary_rate = p_rate
    where id = p_order_id
    returning * into v_order;
  end if;

  insert into public.order_service_salary_events (
    order_id,
    service_code,
    worker_id,
    worker_name,
    service_price,
    salary_rate,
    salary_amount,
    completed_by_worker_id,
    completed_by
  ) values (
    p_order_id,
    v_code,
    p_target_worker_id,
    p_target_worker_name,
    v_price,
    p_rate,
    v_bonus,
    p_actor_worker_id,
    p_actor_name
  )
  returning * into v_event;

  select * into v_salary
  from public.worker_salaries
  where order_id = p_order_id
    and coalesce(entry_type, 'auto') = 'auto'
    and (worker_id = p_target_worker_id or worker_name = p_target_worker_name)
  order by created_at asc
  limit 1
  for update;

  if found then
    update public.worker_salaries
    set
      amount = coalesce(amount, 0) + v_bonus,
      worker_id = coalesce(worker_id, p_target_worker_id)
    where id = v_salary.id
    returning * into v_salary;
  else
    insert into public.worker_salaries (
      worker_name,
      worker_id,
      date,
      amount,
      order_id,
      entry_type
    ) values (
      p_target_worker_name,
      p_target_worker_id,
      v_order.date,
      v_bonus,
      p_order_id,
      'auto'
    )
    returning * into v_salary;
  end if;

  v_salary_json := to_jsonb(v_salary);
  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'salary', v_salary_json,
    'already_completed', false
  );
end;
$$;

revoke all on function public.crm_set_missing_order_service_price(text, text, numeric, uuid, text) from public, anon, authenticated;
revoke all on function public.crm_complete_order_special_service(text, text, uuid, text, uuid, text, numeric) from public, anon, authenticated;
revoke all on table public.order_service_salary_events from anon, authenticated;
grant execute on function public.crm_set_missing_order_service_price(text, text, numeric, uuid, text) to service_role;
grant execute on function public.crm_complete_order_special_service(text, text, uuid, text, uuid, text, numeric) to service_role;
grant select, insert, update on table public.order_service_salary_events to service_role;

notify pgrst, 'reload schema';
