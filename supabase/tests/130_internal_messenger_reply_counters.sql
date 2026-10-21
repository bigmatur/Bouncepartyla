begin;

do $$
declare
	v_auth_customer uuid := '33333333-3333-4333-8333-333333333333';
	v_auth_admin uuid := '44444444-4444-4444-8444-444444444444';
	v_customer_id uuid := 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
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
			v_auth_customer,
			'authenticated',
			'authenticated',
			'im_customer_130_reply_test@example.local',
			'$2a$10$7EqJtq98hPqEX7fNZaFWoOeR6V9Ezg4Q8VE3d2r0Rk5v0zzakDxG6',
			pg_catalog.now(),
			pg_catalog.now(),
			pg_catalog.now(),
			'{}'::jsonb,
			'{}'::jsonb
		),
		(
			v_auth_admin,
			'authenticated',
			'authenticated',
			'im_admin_130_reply_test@example.local',
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
			v_customer_id,
			v_auth_customer,
			'Internal',
			'CounterCustomer',
			'Internal CounterCustomer',
			'5551301001',
			'im_customer_130_reply_test@example.local',
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
			v_auth_customer,
			'customer',
			v_customer_id,
			'Internal',
			'CounterCustomer',
			'5551301001',
			true
		),
		(
			v_auth_admin,
			'admin',
			null,
			'Internal',
			'CounterAdmin',
			'5551301002',
			true
		);
end;
$$;

set local role authenticated;

do $$
declare
	v_auth_customer uuid := '33333333-3333-4333-8333-333333333333';
	v_auth_admin uuid := '44444444-4444-4444-8444-444444444444';
	v_send_result jsonb;
	v_admin_mark_result jsonb;
	v_admin_reply_result jsonb;
	v_customer_mark_result jsonb;
	v_conversation_id uuid;
	v_admin_message_id uuid;
	v_admin_message_id_retry uuid;
	v_unread_count integer := -1;
	v_customer_unread_count integer := -1;
	v_customer_unread_rpc integer := -1;
	v_customer_reply_seen integer := 0;
	v_needs_reply boolean;
	v_customer_message text := 'Customer message for reply counter test';
	v_customer_message_followup text := 'Customer follow-up message for reply counter test';
	v_admin_reply text := 'Admin reply for reply counter test';
begin
	if current_user <> 'authenticated' then
		raise exception 'Reply counters test failed: SQL role switch did not apply (current_user=%)', current_user;
	end if;

	perform set_config('request.jwt.claim.sub', v_auth_customer::text, true);
	perform set_config('request.jwt.claim.role', 'authenticated', true);
	perform set_config(
		'request.jwt.claims',
		pg_catalog.json_build_object(
			'sub', v_auth_customer::text,
			'role', 'authenticated',
			'aud', 'authenticated'
		)::text,
		true
	);

	v_send_result := public.send_my_internal_message(
		'20000000-0000-4000-8000-000000000001'::uuid,
		v_customer_message,
		'[]'::jsonb
	);

	if coalesce((v_send_result ->> 'success')::boolean, false) is not true then
		raise exception 'Reply counters test failed: send_my_internal_message() returned %', v_send_result;
	end if;

	v_conversation_id := nullif(v_send_result ->> 'conversation_id', '')::uuid;

	if v_conversation_id is null then
		raise exception 'Reply counters test failed: customer send returned null conversation_id, payload=%', v_send_result;
	end if;

	perform set_config('request.jwt.claim.sub', v_auth_admin::text, true);
	perform set_config('request.jwt.claim.role', 'authenticated', true);
	perform set_config(
		'request.jwt.claims',
		pg_catalog.json_build_object(
			'sub', v_auth_admin::text,
			'role', 'authenticated',
			'aud', 'authenticated'
		)::text,
		true
	);

	select c.unread_count
		,c.needs_reply
	into v_unread_count, v_needs_reply
	from public.crm_conversations c
	where c.id = v_conversation_id
		and c.conversation_scope = 'internal';

	if coalesce(v_unread_count, -1) <> 1 then
		raise exception 'Reply counters test failed: expected unread_count=1 after customer message, got %', v_unread_count;
	end if;

	if coalesce(v_needs_reply, false) is not true then
		raise exception 'Reply counters test failed: expected needs_reply=true after customer message, got %', v_needs_reply;
	end if;

	v_admin_mark_result := public.admin_mark_internal_conversation_read(v_conversation_id);

	if coalesce((v_admin_mark_result ->> 'success')::boolean, false) is not true then
		raise exception 'Reply counters test failed: admin_mark_internal_conversation_read() returned %', v_admin_mark_result;
	end if;

	select c.unread_count, c.needs_reply
	into v_unread_count, v_needs_reply
	from public.crm_conversations c
	where c.id = v_conversation_id
		and c.conversation_scope = 'internal';

	if coalesce(v_unread_count, -1) <> 0 then
		raise exception 'Reply counters test failed: expected unread_count=0 after admin mark read, got %', v_unread_count;
	end if;

	if coalesce(v_needs_reply, false) is not true then
		raise exception 'Reply counters test failed: expected needs_reply to remain true after admin mark read, got %', v_needs_reply;
	end if;

	v_admin_reply_result := public.admin_reply_internal_conversation(
		v_conversation_id,
		'20000000-0000-4000-8000-000000000002'::uuid,
		v_admin_reply,
		'[]'::jsonb
	);

	if coalesce((v_admin_reply_result ->> 'success')::boolean, false) is not true then
		raise exception 'Reply counters test failed: admin_reply_internal_conversation() returned %', v_admin_reply_result;
	end if;

	v_admin_message_id := nullif(v_admin_reply_result ->> 'message_id', '')::uuid;

	if v_admin_message_id is null then
		raise exception 'Reply counters test failed: admin reply returned null message_id, payload=%', v_admin_reply_result;
	end if;

	select c.customer_unread_count, c.needs_reply
	into v_customer_unread_count, v_needs_reply
	from public.crm_conversations c
	where c.id = v_conversation_id
		and c.conversation_scope = 'internal';

	if coalesce(v_customer_unread_count, -1) <> 1 then
		raise exception 'Reply counters test failed: expected customer_unread_count=1 after admin reply, got %', v_customer_unread_count;
	end if;

	if coalesce(v_needs_reply, true) is not false then
		raise exception 'Reply counters test failed: expected needs_reply=false after admin reply, got %', v_needs_reply;
	end if;

	v_admin_reply_result := public.admin_reply_internal_conversation(
		v_conversation_id,
		'20000000-0000-4000-8000-000000000002'::uuid,
		v_admin_reply,
		'[]'::jsonb
	);

	if coalesce((v_admin_reply_result ->> 'success')::boolean, false) is not true then
		raise exception 'Reply counters test failed: admin retry returned %', v_admin_reply_result;
	end if;

	if coalesce((v_admin_reply_result ->> 'idempotent_replay')::boolean, false) is not true then
		raise exception 'Reply counters test failed: expected idempotent_replay=true on identical admin retry, payload=%', v_admin_reply_result;
	end if;

	v_admin_message_id_retry := nullif(v_admin_reply_result ->> 'message_id', '')::uuid;

	if v_admin_message_id_retry is distinct from v_admin_message_id then
		raise exception 'Reply counters test failed: expected same message_id on admin retry (first=%, retry=%)', v_admin_message_id, v_admin_message_id_retry;
	end if;

	select c.customer_unread_count, c.needs_reply
	into v_customer_unread_count, v_needs_reply
	from public.crm_conversations c
	where c.id = v_conversation_id
		and c.conversation_scope = 'internal';

	if coalesce(v_customer_unread_count, -1) <> 1 then
		raise exception 'Reply counters test failed: expected customer_unread_count to remain 1 after idempotent admin retry, got %', v_customer_unread_count;
	end if;

	if coalesce(v_needs_reply, true) is not false then
		raise exception 'Reply counters test failed: expected needs_reply to remain false after idempotent admin retry, got %', v_needs_reply;
	end if;

	perform set_config('request.jwt.claim.sub', v_auth_customer::text, true);
	perform set_config('request.jwt.claim.role', 'authenticated', true);
	perform set_config(
		'request.jwt.claims',
		pg_catalog.json_build_object(
			'sub', v_auth_customer::text,
			'role', 'authenticated',
			'aud', 'authenticated'
		)::text,
		true
	);

	v_send_result := public.send_my_internal_message(
		'20000000-0000-4000-8000-000000000003'::uuid,
		v_customer_message_followup,
		'[]'::jsonb
	);

	if coalesce((v_send_result ->> 'success')::boolean, false) is not true then
		raise exception 'Reply counters test failed: follow-up customer send returned %', v_send_result;
	end if;

	perform set_config('request.jwt.claim.sub', v_auth_admin::text, true);
	perform set_config('request.jwt.claim.role', 'authenticated', true);
	perform set_config(
		'request.jwt.claims',
		pg_catalog.json_build_object(
			'sub', v_auth_admin::text,
			'role', 'authenticated',
			'aud', 'authenticated'
		)::text,
		true
	);

	select c.unread_count, c.needs_reply
	into v_unread_count, v_needs_reply
	from public.crm_conversations c
	where c.id = v_conversation_id
		and c.conversation_scope = 'internal';

	if coalesce(v_unread_count, -1) <> 1 then
		raise exception 'Reply counters test failed: expected unread_count=1 after follow-up customer message, got %', v_unread_count;
	end if;

	if coalesce(v_needs_reply, false) is not true then
		raise exception 'Reply counters test failed: expected needs_reply=true after follow-up customer message, got %', v_needs_reply;
	end if;

	perform set_config('request.jwt.claim.sub', v_auth_customer::text, true);
	perform set_config('request.jwt.claim.role', 'authenticated', true);
	perform set_config(
		'request.jwt.claims',
		pg_catalog.json_build_object(
			'sub', v_auth_customer::text,
			'role', 'authenticated',
			'aud', 'authenticated'
		)::text,
		true
	);

	v_customer_unread_rpc := public.get_my_internal_unread_count();

	if v_customer_unread_rpc <> 1 then
		raise exception 'Reply counters test failed: expected get_my_internal_unread_count()=1, got %', v_customer_unread_rpc;
	end if;

	select count(*)
	into v_customer_reply_seen
	from public.get_my_internal_messages(100, null::timestamptz, null::uuid) m
	where m.id = v_admin_message_id
		and m.direction = 'outbound'
		and m.body_text = v_admin_reply;

	if v_customer_reply_seen <> 1 then
		raise exception 'Reply counters test failed: customer does not see expected admin reply in get_my_internal_messages()';
	end if;

	v_customer_mark_result := public.mark_my_internal_conversation_read(v_conversation_id);

	if coalesce((v_customer_mark_result ->> 'success')::boolean, false) is not true then
		raise exception 'Reply counters test failed: mark_my_internal_conversation_read() returned %', v_customer_mark_result;
	end if;

	v_customer_unread_rpc := public.get_my_internal_unread_count();

	if v_customer_unread_rpc <> 0 then
		raise exception 'Reply counters test failed: expected get_my_internal_unread_count()=0 after customer mark read, got %', v_customer_unread_rpc;
	end if;
end;
$$;

rollback;