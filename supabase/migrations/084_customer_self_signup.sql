-- 084B — Customer self-signup after verified email.
-- Existing customers are still linked by email exactly as before.
-- A NEW customer row is created only when:
--   1) Supabase has authenticated/verified the email, and
--   2) auth.users.raw_user_meta_data.account_intent = 'customer_signup'.
--
-- This prevents the normal "sign in" form from silently creating CRM customers.

create or replace function public.activate_customer_account()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  current_auth_user auth.users%rowtype;
  existing_profile public.profiles%rowtype;
  matched_customer public.customers%rowtype;
  matching_count integer;
  normalized_email text;
  signup_intent boolean := false;
  signup_first_name text;
  signup_last_name text;
  signup_phone text;
  signup_full_name text;
begin
  if auth.uid() is null then
    return jsonb_build_object(
      'success', false,
      'status', 'not_authenticated'
    );
  end if;

  select *
  into current_auth_user
  from auth.users
  where id = auth.uid();

  if current_auth_user.id is null then
    return jsonb_build_object(
      'success', false,
      'status', 'user_not_found'
    );
  end if;

  normalized_email :=
    lower(trim(coalesce(current_auth_user.email, '')));

  if normalized_email = '' then
    return jsonb_build_object(
      'success', false,
      'status', 'email_missing'
    );
  end if;

  select *
  into existing_profile
  from public.profiles
  where auth_user_id = auth.uid()
  limit 1;

  if existing_profile.id is not null then
    if existing_profile.is_active is not true then
      return jsonb_build_object(
        'success', false,
        'status', 'account_inactive'
      );
    end if;

    if existing_profile.role = 'customer'
       and existing_profile.customer_id is not null then
      return jsonb_build_object(
        'success', true,
        'status', 'already_linked',
        'customer_id', existing_profile.customer_id
      );
    end if;

    return jsonb_build_object(
      'success', false,
      'status', 'staff_account',
      'role', existing_profile.role
    );
  end if;

  -- Serialize activation for the same email to prevent two simultaneous
  -- callbacks from creating duplicate customer records.
  perform pg_advisory_xact_lock(hashtext(normalized_email));

  select count(*)
  into matching_count
  from public.customers
  where lower(trim(email)) = normalized_email;

  if matching_count > 1 then
    return jsonb_build_object(
      'success', false,
      'status', 'multiple_customers',
      'matching_count', matching_count
    );
  end if;

  if matching_count = 1 then
    select *
    into matched_customer
    from public.customers
    where lower(trim(email)) = normalized_email
    limit 1;
  else
    signup_intent :=
      lower(trim(coalesce(
        current_auth_user.raw_user_meta_data ->> 'account_intent',
        ''
      ))) = 'customer_signup';

    if signup_intent is not true then
      return jsonb_build_object(
        'success', false,
        'status', 'customer_not_found'
      );
    end if;

    signup_first_name :=
      trim(coalesce(
        current_auth_user.raw_user_meta_data ->> 'first_name',
        ''
      ));

    signup_last_name :=
      trim(coalesce(
        current_auth_user.raw_user_meta_data ->> 'last_name',
        ''
      ));

    signup_phone :=
      trim(coalesce(
        current_auth_user.raw_user_meta_data ->> 'phone',
        ''
      ));

    if signup_first_name = '' then
      return jsonb_build_object(
        'success', false,
        'status', 'signup_name_missing'
      );
    end if;

    if signup_phone = '' then
      return jsonb_build_object(
        'success', false,
        'status', 'signup_phone_missing'
      );
    end if;

    signup_full_name :=
      trim(concat_ws(' ', signup_first_name, nullif(signup_last_name, '')));

    insert into public.customers (
      first_name,
      last_name,
      full_name,
      phone,
      email,
      default_state
    )
    values (
      signup_first_name,
      nullif(signup_last_name, ''),
      signup_full_name,
      signup_phone,
      normalized_email,
      'CA'
    )
    returning *
    into matched_customer;
  end if;

  insert into public.profiles (
    auth_user_id,
    role,
    customer_id,
    first_name,
    last_name,
    phone,
    is_active
  )
  values (
    auth.uid(),
    'customer',
    matched_customer.id,
    matched_customer.first_name,
    matched_customer.last_name,
    matched_customer.phone,
    true
  );

  return jsonb_build_object(
    'success', true,
    'status',
      case
        when matching_count = 0 then 'created_and_linked'
        else 'linked'
      end,
    'customer_id', matched_customer.id
  );
end;
$function$;
