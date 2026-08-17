-- SwiftGlass CRM: exact source row counts for migration reconciliation.
-- READ ONLY: this script does not modify Supabase.

select *
from (
  select 'backups' as table_name, count(*)::bigint as row_count from public.backups
  union all select 'car_directory', count(*)::bigint from public.car_directory
  union all select 'cash_log', count(*)::bigint from public.cash_log
  union all select 'clients', count(*)::bigint from public.clients
  union all select 'crm_atomic_operations', count(*)::bigint from public.crm_atomic_operations
  union all select 'order_service_salary_events', count(*)::bigint from public.order_service_salary_events
  union all select 'orders', count(*)::bigint from public.orders
  union all select 'ref_app_settings', count(*)::bigint from public.ref_app_settings
  union all select 'ref_dropshippers', count(*)::bigint from public.ref_dropshippers
  union all select 'ref_payment_methods', count(*)::bigint from public.ref_payment_methods
  union all select 'ref_payment_statuses', count(*)::bigint from public.ref_payment_statuses
  union all select 'ref_service_rates', count(*)::bigint from public.ref_service_rates
  union all select 'ref_supplier_statuses', count(*)::bigint from public.ref_supplier_statuses
  union all select 'ref_warehouses', count(*)::bigint from public.ref_warehouses
  union all select 'worker_problems', count(*)::bigint from public.worker_problems
  union all select 'worker_salaries', count(*)::bigint from public.worker_salaries
  union all select 'workers', count(*)::bigint from public.workers
) counts
order by table_name;

