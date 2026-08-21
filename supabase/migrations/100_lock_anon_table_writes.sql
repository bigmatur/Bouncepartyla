-- 100_lock_anon_table_writes.sql
--
-- Security hardening:
-- anonymous users must never modify application tables directly.
--
-- SELECT is intentionally left untouched in this migration.
-- Customer/public read access will be audited separately.

begin;

do $$
declare
  r record;
begin
  for r in
    select
      n.nspname as schema_name,
      c.relname as table_name
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on table %I.%I from anon',
      r.schema_name,
      r.table_name
    );
  end loop;
end
$$;

-- Anonymous users should not consume application sequences directly.
do $$
declare
  r record;
begin
  for r in
    select
      n.nspname as schema_name,
      c.relname as sequence_name
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
  loop
    execute format(
      'revoke usage, select, update on sequence %I.%I from anon',
      r.schema_name,
      r.sequence_name
    );
  end loop;
end
$$;

commit;

notify pgrst, 'reload schema';
