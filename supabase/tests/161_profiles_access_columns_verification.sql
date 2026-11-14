-- Read-only verification for migration 161.
-- Expected result: one row with every *_present value true and
-- profiles_without_default_interface equal to zero.

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'default_interface'
      and data_type = 'text'
  ) as default_interface_present,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'permissions'
      and data_type = 'ARRAY'
  ) as permissions_present,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'denied_permissions'
      and data_type = 'ARRAY'
  ) as denied_permissions_present,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'additional_roles'
      and data_type = 'ARRAY'
  ) as additional_roles_present,
  (
    select count(*)
    from public.profiles
    where default_interface is null
  ) as profiles_without_default_interface;
