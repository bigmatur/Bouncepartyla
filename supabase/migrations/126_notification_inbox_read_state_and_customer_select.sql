begin;

alter table public.notification_deliveries
  add column if not exists read_at timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_deliveries'
      and policyname = 'notification_deliveries_customer_in_app_select'
  ) then
    create policy notification_deliveries_customer_in_app_select
    on public.notification_deliveries
    for select
      to authenticated
    using (
      channel = 'in_app'
      and customer_id is not null
      and exists (
        select 1
        from public.customers c
        where c.id = notification_deliveries.customer_id
          and c.auth_user_id = auth.uid()
      )
    );
  end if;
end;
$$;

create or replace function public.mark_my_notification_read(
  p_delivery_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid;
  v_is_staff boolean := false;
begin
  v_uid := auth.uid();

  if v_uid is null or p_delivery_id is null then
    return false;
  end if;

  v_is_staff := public.current_user_is_staff();

  update public.notification_deliveries d
  set read_at = now(),
      updated_at = now()
  where d.id = p_delivery_id
    and d.channel = 'in_app'
    and d.read_at is null
    and (
      (v_is_staff = true and d.auth_user_id = v_uid)
      or
      (
        v_is_staff = false
        and d.customer_id is not null
        and exists (
          select 1
          from public.customers c
          where c.id = d.customer_id
            and c.auth_user_id = v_uid
        )
      )
    );

  return found;
end;
$$;

revoke all on function public.mark_my_notification_read(uuid) from public, anon, authenticated;
grant execute on function public.mark_my_notification_read(uuid) to authenticated;
grant execute on function public.mark_my_notification_read(uuid) to service_role;

create or replace function public.mark_all_my_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid;
  v_is_staff boolean := false;
  v_updated integer := 0;
begin
  v_uid := auth.uid();

  if v_uid is null then
    return 0;
  end if;

  v_is_staff := public.current_user_is_staff();

  update public.notification_deliveries d
  set read_at = now(),
      updated_at = now()
  where d.channel = 'in_app'
    and d.read_at is null
    and (
      (v_is_staff = true and d.auth_user_id = v_uid)
      or
      (
        v_is_staff = false
        and d.customer_id is not null
        and exists (
          select 1
          from public.customers c
          where c.id = d.customer_id
            and c.auth_user_id = v_uid
        )
      )
    );

  get diagnostics v_updated = row_count;

  return coalesce(v_updated, 0);
end;
$$;

revoke all on function public.mark_all_my_notifications_read() from public, anon, authenticated;
grant execute on function public.mark_all_my_notifications_read() to authenticated;
grant execute on function public.mark_all_my_notifications_read() to service_role;

notify pgrst, 'reload schema';

commit;
