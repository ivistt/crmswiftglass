-- Быстрые точные итоги кассы без снапшотов и изменения финансовых записей.
-- Функция каждый раз считает результат по актуальному cash_log.

create index if not exists cash_log_active_created_at_idx
  on public.cash_log (created_at desc)
  where deleted_at is null;

create index if not exists cash_log_worker_id_active_created_at_idx
  on public.cash_log (worker_id, created_at desc)
  where deleted_at is null;

create index if not exists cash_log_cash_owner_id_active_created_at_idx
  on public.cash_log (cash_owner_id, created_at desc)
  where deleted_at is null;

create index if not exists cash_log_worker_name_active_created_at_idx
  on public.cash_log (worker_name, created_at desc)
  where deleted_at is null;

create index if not exists cash_log_cash_owner_active_created_at_idx
  on public.cash_log (cash_owner, created_at desc)
  where deleted_at is null;

create or replace function public.crm_cash_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with normalized as (
    select
      coalesce(nullif(id_worker.name, ''), nullif(pm.worker_name, ''), nullif(c.cash_owner, ''), nullif(c.worker_name, '')) as worker_name,
      coalesce(c.cash_owner_id, c.worker_id) as worker_id,
      coalesce(nullif(c.account_type, ''), nullif(c.cash_account, ''), 'cash') as account_type,
      coalesce(
        nullif(c.approval_status, ''),
        case
          when c.fop_confirmed is true then 'confirmed'
          when coalesce(nullif(c.account_type, ''), nullif(c.cash_account, ''), 'cash') = 'fop' then 'pending'
          when coalesce(pm.requires_confirmation, false) is true or pm.method_type in ('card', 'fop') then 'pending'
          when coalesce(nullif(c.payment_method, ''), nullif(c.manual_payment_method, ''), '') <> ''
            and coalesce(nullif(c.payment_method, ''), nullif(c.manual_payment_method, ''), '') <> '🪙 Наличка'
            then 'pending'
          else 'not_required'
        end
      ) as approval_status,
      coalesce(c.manual_payment, false) as manual_payment,
      coalesce(c.amount, 0)::numeric as amount,
      coalesce(c.expense_category, '') <> '' or coalesce(c.comment, '') like 'Расход(%' as is_expense,
      coalesce(c.comment, '') like 'FXUSD|%' as is_currency,
      case
        when coalesce(c.comment, '') ~ '^FXUSD\|usd=[+-]?[0-9]+([.][0-9]+)?(\||$)'
          then split_part(split_part(c.comment, 'usd=', 2), '|', 1)::numeric
        else 0::numeric
      end as usd_amount,
      case
        when coalesce(c.comment, '') ~ '(^|\|)uah=[+-]?[0-9]+([.][0-9]+)?(\||$)'
          then abs(split_part(split_part(c.comment, 'uah=', 2), '|', 1)::numeric)
        else abs(coalesce(c.amount, 0)::numeric)
      end as currency_uah_amount
    from public.cash_log c
    left join public.workers id_worker
      on id_worker.id = coalesce(c.cash_owner_id, c.worker_id)
    left join public.ref_payment_methods pm
      on lower(pm.label) = lower(coalesce(nullif(c.payment_method, ''), nullif(c.manual_payment_method, '')))
     and pm.active is true
    where c.deleted_at is null
      and coalesce(c.ledger_status, 'posted') <> 'voided'
  ), eligible as (
    select *
    from normalized
    where worker_name is not null
      and manual_payment is not true
  ), grouped as (
    select
      worker_id,
      worker_name,
      coalesce(sum(amount) filter (
        where account_type <> 'currency'
          and approval_status in ('confirmed', 'not_required')
          and (is_currency is false or currency_uah_amount > 0)
      ), 0)::numeric as confirmed_uah,
      coalesce(sum(amount) filter (
        where account_type = 'cash'
          and approval_status in ('confirmed', 'not_required')
          and (is_currency is false or currency_uah_amount > 0)
      ), 0)::numeric as confirmed_cash_uah,
      coalesce(sum(amount) filter (
        where account_type = 'fop'
          and approval_status in ('confirmed', 'not_required')
      ), 0)::numeric as confirmed_fop_uah,
      coalesce(sum(amount) filter (
        where account_type <> 'currency'
          and approval_status = 'pending'
          and (is_currency is false or currency_uah_amount > 0)
      ), 0)::numeric as pending_uah,
      coalesce(sum(usd_amount) filter (where is_currency), 0)::numeric as usd,
      coalesce(sum(abs(amount)) filter (where is_expense), 0)::numeric as expense_total,
      count(*)::bigint as entries_count
    from eligible
    group by worker_id, worker_name
  )
  select jsonb_build_object(
    'generated_at', now(),
    'total_confirmed_uah', coalesce(sum(confirmed_uah), 0),
    'total_pending_uah', coalesce(sum(pending_uah), 0),
    'total_usd', coalesce(sum(usd), 0),
    'total_expenses', coalesce(sum(expense_total), 0),
    'entries_count', coalesce(sum(entries_count), 0),
    'workers', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'worker_id', worker_id,
          'worker_name', worker_name,
          'confirmed_uah', confirmed_uah,
          'confirmed_cash_uah', confirmed_cash_uah,
          'confirmed_fop_uah', confirmed_fop_uah,
          'pending_uah', pending_uah,
          'usd', usd,
          'expense_total', expense_total,
          'entries_count', entries_count
        ) order by worker_name
      ),
      '[]'::jsonb
    )
  )
  from grouped;
$$;

-- После выполнения можно безопасно проверить результат:
-- select public.crm_cash_summary();

notify pgrst, 'reload schema';
