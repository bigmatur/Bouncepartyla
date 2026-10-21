begin;

do $$
declare
  v_admin_auth uuid := '90000000-0000-4000-8000-000000000001';
  v_manager_auth uuid := '90000000-0000-4000-8000-000000000002';
  v_customer_auth uuid := '90000000-0000-4000-8000-000000000003';
  v_customer_id uuid := '90000000-0000-4000-8000-000000000101';
  v_booking_id uuid := '90000000-0000-4000-8000-000000000201';
begin
  insert into auth.users (
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data
  )
  values
    (
      v_admin_auth,
      'authenticated',
      'authenticated',
      'test_admin_131_notifications@example.local',
      '$2a$10$7EqJtq98hPqEX7fNZaFWoOeR6V9Ezg4Q8VE3d2r0Rk5v0zzakDxG6',
      now(),
      now(),
      now(),
      '{}'::jsonb,
      '{}'::jsonb
    ),
    (
      v_manager_auth,
      'authenticated',
      'authenticated',
      'test_manager_131_notifications@example.local',
      '$2a$10$7EqJtq98hPqEX7fNZaFWoOeR6V9Ezg4Q8VE3d2r0Rk5v0zzakDxG6',
      now(),
      now(),
      now(),
      '{}'::jsonb,
      '{}'::jsonb
    ),
    (
      v_customer_auth,
      'authenticated',
      'authenticated',
      'test_customer_131_notifications@example.local',
      '$2a$10$7EqJtq98hPqEX7fNZaFWoOeR6V9Ezg4Q8VE3d2r0Rk5v0zzakDxG6',
      now(),
      now(),
      now(),
      '{}'::jsonb,
      '{}'::jsonb
    )
  on conflict (id) do nothing;

  insert into public.customers (
    id,
    auth_user_id,
    first_name,
    last_name,
    full_name,
    phone,
    email,
    default_state
  )
  values (
    v_customer_id,
    v_customer_auth,
    'Notify',
    'Customer',
    'Notify Customer',
    '5551311001',
    'test_customer_131_notifications@example.local',
    'CA'
  )
  on conflict (id) do update
  set
    auth_user_id = excluded.auth_user_id,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    full_name = excluded.full_name,
    phone = excluded.phone,
    email = excluded.email,
    default_state = excluded.default_state;

  insert into public.profiles (
    auth_user_id,
    role,
    customer_id,
    first_name,
    last_name,
    phone,
    is_active
  )
  values
    (
      v_admin_auth,
      'admin',
      null,
      'Test',
      'Admin',
      '5551312001',
      true
    ),
    (
      v_manager_auth,
      'manager',
      null,
      'Test',
      'Manager',
      '5551312002',
      true
    ),
    (
      v_customer_auth,
      'customer',
      v_customer_id,
      'Notify',
      'Customer',
      '5551311001',
      true
    )
  on conflict (auth_user_id) do update
  set
    role = excluded.role,
    customer_id = excluded.customer_id,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    phone = excluded.phone,
    is_active = true;

  insert into public.bookings (
    id,
    customer_id,
    customer_name,
    customer_email,
    customer_phone,
    event_date,
    event_time,
    service_type,
    event_duration,
    event_address,
    event_city,
    event_state,
    event_zip_code,
    status,
    subtotal,
    delivery_fee,
    tax_amount,
    total_amount,
    balance_due,
    created_at,
    updated_at
  )
  values (
    v_booking_id,
    v_customer_id,
    'Notify Customer',
    'test_customer_131_notifications@example.local',
    '5551311001',
    current_date + 7,
    '12:00 PM',
    'delivery',
    '4 hours',
    '131 Notifications Way',
    'Los Angeles',
    'CA',
    '90001',
    'confirmed',
    500,
    0,
    0,
    500,
    500,
    now(),
    now()
  )
  on conflict (id) do update
  set
    customer_id = excluded.customer_id,
    customer_name = excluded.customer_name,
    customer_email = excluded.customer_email,
    customer_phone = excluded.customer_phone,
    status = excluded.status,
    subtotal = excluded.subtotal,
    delivery_fee = excluded.delivery_fee,
    tax_amount = excluded.tax_amount,
    total_amount = excluded.total_amount,
    balance_due = excluded.balance_due,
    updated_at = now();
end;
$$;

set local role service_role;

do $$
declare
  v_booking_id uuid := '90000000-0000-4000-8000-000000000201';
  v_inserted_admin integer;
  v_inserted_manager integer;
begin
  if current_user <> 'service_role' then
    raise exception '131 notifications test failed: SQL role switch to service_role did not apply (current_user=%)', current_user;
  end if;

  v_inserted_admin := public.enqueue_staff_booking_notification(
    'payment_received',
    v_booking_id,
    'admin',
    '131-admin',
    jsonb_build_object(
      'payment_amount', 123.45,
      'payment_method', 'Card',
      'payment_collected_method', 'card',
      'route_stop_id', '90000000-0000-4000-8000-000000000301',
      'action_url', '/admin/bookings/' || v_booking_id::text
    )
  );

  if coalesce(v_inserted_admin, 0) <= 0 then
    raise exception '131 notifications test failed: admin enqueue inserted no deliveries';
  end if;

  v_inserted_manager := public.enqueue_staff_booking_notification(
    'payment_received',
    v_booking_id,
    'manager',
    '131-manager',
    jsonb_build_object(
      'payment_amount', 123.45,
      'payment_method', 'Card',
      'payment_collected_method', 'card',
      'route_stop_id', '90000000-0000-4000-8000-000000000301',
      'action_url', '/admin/bookings/' || v_booking_id::text
    )
  );

  if coalesce(v_inserted_manager, 0) <= 0 then
    raise exception '131 notifications test failed: manager enqueue inserted no deliveries';
  end if;
end;
$$;

reset role;

do $$
declare
  v_admin_auth uuid := '90000000-0000-4000-8000-000000000001';
  v_manager_auth uuid := '90000000-0000-4000-8000-000000000002';
  v_booking_id uuid := '90000000-0000-4000-8000-000000000201';
  v_admin_count integer;
  v_manager_count integer;
  v_admin_role_level_count integer;
  v_manager_role_level_count integer;
begin
  if current_user <> 'postgres' then
    raise exception '131 notifications test failed: postgres verification role expected (current_user=%)', current_user;
  end if;

  select count(*)
  into v_admin_count
  from public.notification_deliveries d
  where d.event_code = 'payment_received'
    and d.booking_id = v_booking_id
    and d.recipient_role = 'admin'
    and d.channel in ('in_app', 'email')
    and d.auth_user_id = v_admin_auth
    and d.dedupe_key like 'payment_received:%:admin:%:131-admin';

  if coalesce(v_admin_count, 0) <= 0 then
    raise exception '131 notifications test failed: expected personalized admin delivery with auth_user_id';
  end if;

  select count(*)
  into v_manager_count
  from public.notification_deliveries d
  where d.event_code = 'payment_received'
    and d.booking_id = v_booking_id
    and d.recipient_role = 'manager'
    and d.channel in ('in_app', 'email')
    and d.auth_user_id = v_manager_auth
    and d.dedupe_key like 'payment_received:%:manager:%:131-manager';

  if coalesce(v_manager_count, 0) <= 0 then
    raise exception '131 notifications test failed: expected personalized manager delivery with auth_user_id';
  end if;

  select count(*)
  into v_admin_role_level_count
  from public.notification_deliveries d
  where d.event_code = 'payment_received'
    and d.booking_id = v_booking_id
    and d.recipient_role = 'admin'
    and d.channel in ('in_app', 'email')
    and d.auth_user_id is null
    and d.dedupe_key like 'payment_received:%:admin:%:131-admin';

  if coalesce(v_admin_role_level_count, 0) > 0 then
    raise exception '131 notifications test failed: unexpected role-level admin fallback for personalized channel';
  end if;

  select count(*)
  into v_manager_role_level_count
  from public.notification_deliveries d
  where d.event_code = 'payment_received'
    and d.booking_id = v_booking_id
    and d.recipient_role = 'manager'
    and d.channel in ('in_app', 'email')
    and d.auth_user_id is null
    and d.dedupe_key like 'payment_received:%:manager:%:131-manager';

  if coalesce(v_manager_role_level_count, 0) > 0 then
    raise exception '131 notifications test failed: unexpected role-level manager fallback for personalized channel';
  end if;
end;
$$;

rollback;
