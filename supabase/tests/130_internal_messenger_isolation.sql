begin;

do $$
declare
	v_auth_a uuid := '11111111-1111-4111-8111-111111111111';
	v_auth_b uuid := '22222222-2222-4222-8222-222222222222';
	v_customer_a uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
	v_customer_b uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
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
			v_auth_a,
			'authenticated',
			'authenticated',
			'im_a_130_test@example.local',
			'$2a$10$7EqJtq98hPqEX7fNZaFWoOeR6V9Ezg4Q8VE3d2r0Rk5v0zzakDxG6',
			pg_catalog.now(),
			pg_catalog.now(),
			pg_catalog.now(),
			'{}'::jsonb,
			'{}'::jsonb
		),
		(
			v_auth_b,
			'authenticated',
			'authenticated',
			'im_b_130_test@example.local',
			'$2a$10$7EqJtq98hPqEX7fNZaFWoOeR6V9Ezg4Q8VE3d2r0Rk5v0zzakDxG6',
			pg_catalog.now(),
			pg_catalog.now(),
			pg_catalog.now(),
			'{}'::jsonb,
			'{}'::jsonb
		);

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
	values
		(
			v_customer_a,
			v_auth_a,
			'Internal',
			'CustomerA',
			'Internal CustomerA',
			'5551300001',
			'im_a_130_test@example.local',
			'CA'
		),
		(
			v_customer_b,
			v_auth_b,
			'Internal',
			'CustomerB',
			'Internal CustomerB',
			'5551300002',
			'im_b_130_test@example.local',
			'CA'
		);

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
			v_auth_a,
			'customer',
			v_customer_a,
			'Internal',
			'CustomerA',
			'5551300001',
			true
		),
		(
			v_auth_b,
			'customer',
			v_customer_b,
			'Internal',
			'CustomerB',
			'5551300002',
			true
		);
end;
$$;

set local role authenticated;

do $$
declare
	v_auth_a uuid := '11111111-1111-4111-8111-111111111111';
	v_auth_b uuid := '22222222-2222-4222-8222-222222222222';
	v_send_result jsonb;
	v_mark_result jsonb;
	v_conversation_a uuid;
	v_a_message_count integer := 0;
	v_b_message_count integer := 0;
	v_b_mark_success boolean := false;
begin

	if current_user <> 'authenticated' then
		raise exception 'Isolation test failed: SQL role switch did not apply (current_user=%)', current_user;
	end if;

	perform set_config('request.jwt.claim.sub', v_auth_a::text, true);
	perform set_config('request.jwt.claim.role', 'authenticated', true);
	perform set_config(
		'request.jwt.claims',
		pg_catalog.json_build_object(
			'sub', v_auth_a::text,
			'role', 'authenticated',
			'aud', 'authenticated'
		)::text,
		true
	);

	v_send_result := public.send_my_internal_message(
		'10000000-0000-4000-8000-000000000001'::uuid,
		'A-only internal message for isolation test',
		'[]'::jsonb
	);

	if coalesce((v_send_result ->> 'success')::boolean, false) is not true then
		raise exception 'Isolation test failed: send_my_internal_message() for A returned %', v_send_result;
	end if;

	v_conversation_a := nullif(v_send_result ->> 'conversation_id', '')::uuid;

	if v_conversation_a is null then
		raise exception 'Isolation test failed: A conversation_id is null, payload=%', v_send_result;
	end if;

	select count(*)
	into v_a_message_count
	from public.get_my_internal_messages(100, null::timestamptz, null::uuid);

	if v_a_message_count < 1 then
		raise exception 'Isolation test failed: A cannot see own message via get_my_internal_messages()';
	end if;

	perform set_config('request.jwt.claim.sub', v_auth_b::text, true);
	perform set_config('request.jwt.claim.role', 'authenticated', true);
	perform set_config(
		'request.jwt.claims',
		pg_catalog.json_build_object(
			'sub', v_auth_b::text,
			'role', 'authenticated',
			'aud', 'authenticated'
		)::text,
		true
	);

	select count(*)
	into v_b_message_count
	from public.get_my_internal_messages(100, null::timestamptz, null::uuid);

	if v_b_message_count <> 0 then
		raise exception 'Isolation test failed: B can see messages not belonging to B (count=%)', v_b_message_count;
	end if;

	v_mark_result := public.mark_my_internal_conversation_read(v_conversation_a);
	v_b_mark_success := coalesce((v_mark_result ->> 'success')::boolean, false);

	if v_b_mark_success then
		raise exception 'Isolation test failed: B marked A conversation as read, result=%', v_mark_result;
	end if;
end;
$$;

rollback;
