alter table public.cash_log
  add column if not exists cash_owner text,
  add column if not exists account_type text,
  add column if not exists payment_type text,
  add column if not exists payment_method text,
  add column if not exists approval_status text,
  add column if not exists approval_by text,
  add column if not exists source_type text,
  add column if not exists source_id text,
  add column if not exists order_id text,
  add column if not exists expense_category text,
  add column if not exists warehouse_name text;

update public.cash_log
set
  cash_owner = coalesce(cash_owner, worker_name),
  account_type = coalesce(account_type, cash_account),
  payment_type = coalesce(
    payment_type,
    case
      when comment like 'Расход(%' then 'expense'
      when comment like 'FXUSD|%' then 'transfer'
      when manual_payment = true then 'card'
      when cash_account = 'fop' then 'transfer'
      when fop_source_key like 'order:%' then 'card'
      else 'cash'
    end
  ),
  payment_method = coalesce(payment_method, nullif(manual_payment_method, '')),
  approval_status = coalesce(
    approval_status,
    case
      when cash_account = 'fop' or fop_source_key like 'order:%' then
        case when fop_confirmed = true then 'confirmed' else 'pending' end
      else 'not_required'
    end
  ),
  source_type = coalesce(
    source_type,
    case
      when comment like 'Расход(%' then 'expense'
      when comment like 'FXUSD|%' then 'exchange'
      when manual_payment = true then 'manual'
      when fop_source_key like 'order:%' then 'order'
      else 'manual'
    end
  ),
  source_id = coalesce(source_id, nullif(fop_source_key, '')),
  order_id = coalesce(
    order_id,
    case
      when fop_source_key like 'order:%'
        then split_part(split_part(fop_source_key, '|', 1), ':', 2)
      else null
    end
  )
where cash_owner is null
   or account_type is null
   or payment_type is null
   or payment_method is null
   or approval_status is null
   or source_type is null
   or source_id is null
   or order_id is null;

create index if not exists cash_log_cash_owner_idx on public.cash_log (cash_owner);
create index if not exists cash_log_account_type_idx on public.cash_log (account_type);
create index if not exists cash_log_payment_type_idx on public.cash_log (payment_type);
create index if not exists cash_log_payment_method_idx on public.cash_log (payment_method);
create index if not exists cash_log_approval_status_idx on public.cash_log (approval_status);
create index if not exists cash_log_source_type_idx on public.cash_log (source_type);
create index if not exists cash_log_order_id_idx on public.cash_log (order_id);
create index if not exists cash_log_expense_category_idx on public.cash_log (expense_category);
create index if not exists cash_log_warehouse_name_idx on public.cash_log (warehouse_name);
