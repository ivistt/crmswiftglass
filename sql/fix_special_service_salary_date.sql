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
  v_salary_date date;
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

  v_salary_date := case
    when nullif(trim(v_order.date::text), '') ~ '^\d{4}-\d{2}-\d{2}' then left(trim(v_order.date::text), 10)::date
    else current_date
  end;

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
      v_salary_date,
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

revoke all on function public.crm_complete_order_special_service(text, text, uuid, text, uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.crm_complete_order_special_service(text, text, uuid, text, uuid, text, numeric) to service_role;
