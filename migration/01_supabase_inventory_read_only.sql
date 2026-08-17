-- SwiftGlass CRM: inventory of the legacy Supabase database.
-- READ ONLY: this script does not create, update, or delete anything.
-- Run it in Supabase SQL Editor and download/copy the single resulting JSON value.

with
relations as (
  select
    n.nspname as schema_name,
    c.relname as relation_name,
    case c.relkind
      when 'r' then 'table'
      when 'p' then 'partitioned_table'
      when 'v' then 'view'
      when 'm' then 'materialized_view'
      else c.relkind::text
    end as relation_type,
    case
      when c.relkind in ('r', 'p', 'm') then coalesce(s.n_live_tup, 0)::bigint
      else null
    end as estimated_rows,
    case
      when c.relkind in ('r', 'p', 'm') then pg_total_relation_size(c.oid)
      else null
    end as total_bytes,
    c.relrowsecurity as row_level_security_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_stat_user_tables s
    on s.relid = c.oid
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm')
),
columns_info as (
  select
    c.table_schema as schema_name,
    c.table_name,
    c.ordinal_position,
    c.column_name,
    c.data_type,
    c.udt_name,
    c.is_nullable,
    c.column_default,
    c.character_maximum_length,
    c.numeric_precision,
    c.numeric_scale
  from information_schema.columns c
  where c.table_schema = 'public'
),
constraints_info as (
  select
    n.nspname as schema_name,
    cl.relname as table_name,
    con.conname as constraint_name,
    case con.contype
      when 'p' then 'primary_key'
      when 'f' then 'foreign_key'
      when 'u' then 'unique'
      when 'c' then 'check'
      when 'x' then 'exclusion'
      else con.contype::text
    end as constraint_type,
    pg_get_constraintdef(con.oid, true) as definition
  from pg_constraint con
  join pg_class cl on cl.oid = con.conrelid
  join pg_namespace n on n.oid = cl.relnamespace
  where n.nspname = 'public'
),
indexes_info as (
  select
    i.schemaname as schema_name,
    i.tablename as table_name,
    i.indexname as index_name,
    i.indexdef as definition
  from pg_indexes i
  where i.schemaname = 'public'
),
policies_info as (
  select
    p.schemaname as schema_name,
    p.tablename as table_name,
    p.policyname as policy_name,
    p.permissive,
    p.roles,
    p.cmd,
    p.qual,
    p.with_check
  from pg_policies p
  where p.schemaname = 'public'
),
enums_info as (
  select
    n.nspname as schema_name,
    t.typname as enum_name,
    e.enumsortorder,
    e.enumlabel
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  join pg_enum e on e.enumtypid = t.oid
  where n.nspname = 'public'
),
routines_info as (
  select
    n.nspname as schema_name,
    p.proname as routine_name,
    pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result_type,
    p.prokind as routine_kind,
    l.lanname as language
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
  where n.nspname = 'public'
)
select jsonb_pretty(
  jsonb_build_object(
    'generated_at', now(),
    'database_schema', 'public',
    'relations', coalesce(
      (select jsonb_agg(to_jsonb(r) order by r.relation_name) from relations r),
      '[]'::jsonb
    ),
    'columns', coalesce(
      (
        select jsonb_agg(to_jsonb(c) order by c.table_name, c.ordinal_position)
        from columns_info c
      ),
      '[]'::jsonb
    ),
    'constraints', coalesce(
      (
        select jsonb_agg(to_jsonb(c) order by c.table_name, c.constraint_name)
        from constraints_info c
      ),
      '[]'::jsonb
    ),
    'indexes', coalesce(
      (
        select jsonb_agg(to_jsonb(i) order by i.table_name, i.index_name)
        from indexes_info i
      ),
      '[]'::jsonb
    ),
    'rls_policies', coalesce(
      (
        select jsonb_agg(to_jsonb(p) order by p.table_name, p.policy_name)
        from policies_info p
      ),
      '[]'::jsonb
    ),
    'enums', coalesce(
      (
        select jsonb_agg(to_jsonb(e) order by e.enum_name, e.enumsortorder)
        from enums_info e
      ),
      '[]'::jsonb
    ),
    'routines', coalesce(
      (
        select jsonb_agg(to_jsonb(r) order by r.routine_name, r.arguments)
        from routines_info r
      ),
      '[]'::jsonb
    )
  )
) as migration_inventory;
