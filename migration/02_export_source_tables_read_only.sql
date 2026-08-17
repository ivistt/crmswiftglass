-- SwiftGlass CRM: export of every legacy public table.
-- READ ONLY: every statement is a SELECT. Nothing is written to Supabase.
--
-- Supabase SQL Editor instructions:
--   1. Select ONE statement at a time (from SELECT through the semicolon).
--   2. Click Run.
--   3. Click Download CSV and use the filename shown above that statement.
--   4. Do not open/edit/resave the downloaded CSV in Excel.
--
-- Security rule:
--   A 16-digit bank-card number, written continuously or in four groups,
--   is replaced by "•••• 1234" (last four digits retained). This is the only
--   intentional change in raw exports. UUID and phone numbers are retained.
--
-- `backups` and `crm_atomic_operations` are exported for source audit only.
-- They must not be imported into the new CRM.


-- raw/backups.csv
select (
  jsonb_populate_record(
    null::public.backups,
    regexp_replace(
      to_jsonb(source_row)::text,
      '(^|[^0-9A-Za-z-])[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?([0-9]{4})([^0-9A-Za-z-]|$)',
      '\1•••• \2\3',
      'g'
    )::jsonb
  )
).*
from public.backups source_row
order by id;


-- raw/car_directory.csv
select (
  jsonb_populate_record(
    null::public.car_directory,
    regexp_replace(
      to_jsonb(source_row)::text,
      '(^|[^0-9A-Za-z-])[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?([0-9]{4})([^0-9A-Za-z-]|$)',
      '\1•••• \2\3',
      'g'
    )::jsonb
  )
).*
from public.car_directory source_row
order by model, id;


-- raw/cash_log.csv
select (
  jsonb_populate_record(
    null::public.cash_log,
    regexp_replace(
      to_jsonb(source_row)::text,
      '(^|[^0-9A-Za-z-])[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?([0-9]{4})([^0-9A-Za-z-]|$)',
      '\1•••• \2\3',
      'g'
    )::jsonb
  )
).*
from public.cash_log source_row
order by created_at, id;


-- raw/clients.csv
select (
  jsonb_populate_record(
    null::public.clients,
    regexp_replace(
      to_jsonb(source_row)::text,
      '(^|[^0-9A-Za-z-])[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?([0-9]{4})([^0-9A-Za-z-]|$)',
      '\1•••• \2\3',
      'g'
    )::jsonb
  )
).*
from public.clients source_row
order by created_at, id;


-- raw/crm_atomic_operations.csv (audit only; do not import)
select (
  jsonb_populate_record(
    null::public.crm_atomic_operations,
    regexp_replace(
      to_jsonb(source_row)::text,
      '(^|[^0-9A-Za-z-])[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?([0-9]{4})([^0-9A-Za-z-]|$)',
      '\1•••• \2\3',
      'g'
    )::jsonb
  )
).*
from public.crm_atomic_operations source_row
order by created_at, operation_id;


-- raw/order_service_salary_events.csv
select (
  jsonb_populate_record(
    null::public.order_service_salary_events,
    regexp_replace(
      to_jsonb(source_row)::text,
      '(^|[^0-9A-Za-z-])[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?([0-9]{4})([^0-9A-Za-z-]|$)',
      '\1•••• \2\3',
      'g'
    )::jsonb
  )
).*
from public.order_service_salary_events source_row
order by completed_at, id;


-- raw/orders.csv
select (
  jsonb_populate_record(
    null::public.orders,
    regexp_replace(
      to_jsonb(source_row)::text,
      '(^|[^0-9A-Za-z-])[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?([0-9]{4})([^0-9A-Za-z-]|$)',
      '\1•••• \2\3',
      'g'
    )::jsonb
  )
).*
from public.orders source_row
order by created_at, id;


-- raw/ref_app_settings.csv
select (
  jsonb_populate_record(
    null::public.ref_app_settings,
    regexp_replace(
      to_jsonb(source_row)::text,
      '(^|[^0-9A-Za-z-])[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?([0-9]{4})([^0-9A-Za-z-]|$)',
      '\1•••• \2\3',
      'g'
    )::jsonb
  )
).*
from public.ref_app_settings source_row
order by key, id;


-- raw/ref_dropshippers.csv
select (
  jsonb_populate_record(
    null::public.ref_dropshippers,
    regexp_replace(
      to_jsonb(source_row)::text,
      '(^|[^0-9A-Za-z-])[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?([0-9]{4})([^0-9A-Za-z-]|$)',
      '\1•••• \2\3',
      'g'
    )::jsonb
  )
).*
from public.ref_dropshippers source_row
order by name, id;


-- raw/ref_payment_methods.csv
select (
  jsonb_populate_record(
    null::public.ref_payment_methods,
    regexp_replace(
      to_jsonb(source_row)::text,
      '(^|[^0-9A-Za-z-])[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?([0-9]{4})([^0-9A-Za-z-]|$)',
      '\1•••• \2\3',
      'g'
    )::jsonb
  )
).*
from public.ref_payment_methods source_row
order by sort_order, id;


-- raw/ref_payment_statuses.csv
select (
  jsonb_populate_record(
    null::public.ref_payment_statuses,
    regexp_replace(
      to_jsonb(source_row)::text,
      '(^|[^0-9A-Za-z-])[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?([0-9]{4})([^0-9A-Za-z-]|$)',
      '\1•••• \2\3',
      'g'
    )::jsonb
  )
).*
from public.ref_payment_statuses source_row
order by name, id;


-- raw/ref_service_rates.csv
select (
  jsonb_populate_record(
    null::public.ref_service_rates,
    regexp_replace(
      to_jsonb(source_row)::text,
      '(^|[^0-9A-Za-z-])[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?([0-9]{4})([^0-9A-Za-z-]|$)',
      '\1•••• \2\3',
      'g'
    )::jsonb
  )
).*
from public.ref_service_rates source_row
order by sort_order, id;


-- raw/ref_supplier_statuses.csv
select (
  jsonb_populate_record(
    null::public.ref_supplier_statuses,
    regexp_replace(
      to_jsonb(source_row)::text,
      '(^|[^0-9A-Za-z-])[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?([0-9]{4})([^0-9A-Za-z-]|$)',
      '\1•••• \2\3',
      'g'
    )::jsonb
  )
).*
from public.ref_supplier_statuses source_row
order by name, id;


-- raw/ref_warehouses.csv
select (
  jsonb_populate_record(
    null::public.ref_warehouses,
    regexp_replace(
      to_jsonb(source_row)::text,
      '(^|[^0-9A-Za-z-])[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?([0-9]{4})([^0-9A-Za-z-]|$)',
      '\1•••• \2\3',
      'g'
    )::jsonb
  )
).*
from public.ref_warehouses source_row
order by name, id;


-- raw/worker_problems.csv
select (
  jsonb_populate_record(
    null::public.worker_problems,
    regexp_replace(
      to_jsonb(source_row)::text,
      '(^|[^0-9A-Za-z-])[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?([0-9]{4})([^0-9A-Za-z-]|$)',
      '\1•••• \2\3',
      'g'
    )::jsonb
  )
).*
from public.worker_problems source_row
order by date, created_at, id;


-- raw/worker_salaries.csv
select (
  jsonb_populate_record(
    null::public.worker_salaries,
    regexp_replace(
      to_jsonb(source_row)::text,
      '(^|[^0-9A-Za-z-])[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?([0-9]{4})([^0-9A-Za-z-]|$)',
      '\1•••• \2\3',
      'g'
    )::jsonb
  )
).*
from public.worker_salaries source_row
order by date, created_at, id;


-- raw/workers.csv
-- Contains only the existing pin_hash. No plaintext PIN is present or derived.
select (
  jsonb_populate_record(
    null::public.workers,
    regexp_replace(
      to_jsonb(source_row)::text,
      '(^|[^0-9A-Za-z-])[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?([0-9]{4})([^0-9A-Za-z-]|$)',
      '\1•••• \2\3',
      'g'
    )::jsonb
  )
).*
from public.workers source_row
order by created_at, id;


-- Optional audit export of the view; it duplicates a subset of workers.csv.
-- raw/workers_public.csv
select (
  jsonb_populate_record(
    null::public.workers_public,
    regexp_replace(
      to_jsonb(source_row)::text,
      '(^|[^0-9A-Za-z-])[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?[0-9]{4}[[:space:]-]?([0-9]{4})([^0-9A-Za-z-]|$)',
      '\1•••• \2\3',
      'g'
    )::jsonb
  )
).*
from public.workers_public source_row
order by created_at, id;
