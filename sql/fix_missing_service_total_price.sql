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

  if v_code not in ('total', 'mount', 'molding', 'extra_work', 'tatu', 'toning') then
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
    when 'total' then coalesce(v_order.total, 0)
    when 'mount' then coalesce(v_order.mount, 0)
    when 'molding' then coalesce(v_order.molding, 0)
    when 'extra_work' then coalesce(v_order.extra_work, 0)
    when 'tatu' then coalesce(v_order.tatu, 0)
    when 'toning' then coalesce(v_order.toning, 0)
  end;

  if v_current > 0 then
    if v_current = p_amount then
      return to_jsonb(v_order);
    end if;
    raise exception 'Цена уже установлена';
  end if;

  if v_code = 'total' then
    update public.orders
    set
      total = p_amount,
      payment_status = case
        when coalesce(debt, 0) <= 0 then 'Не оплачено'
        when p_amount + coalesce(income, 0) + coalesce(delivery, 0) > 0
          and coalesce(debt, 0) >= p_amount + coalesce(income, 0) + coalesce(delivery, 0)
          then 'Оплачено'
        else 'Частично'
      end,
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

    return to_jsonb(v_order);
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

revoke all on function public.crm_set_missing_order_service_price(text, text, numeric, uuid, text) from public, anon, authenticated;
grant execute on function public.crm_set_missing_order_service_price(text, text, numeric, uuid, text) to service_role;
