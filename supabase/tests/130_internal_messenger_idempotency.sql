begin;

-- Regression coverage for internal messenger idempotency semantics.

do $$
declare
	v_auth_customer_a uuid := '90909090-9090-4090-8090-909090909090';
	v_auth_customer_b uuid := '91919191-9191-4191-8191-919191919191';
	v_auth_admin uuid := '92929292-9292-4292-8292-929292929292';
	v_customer_a uuid := 'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0';
	v_customer_b uuid := 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1';
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
			v_auth_customer_a,
			'authenticated',
			'authenticated',
			'im_idem_customer_a_130@example.local',
			'$2a$10$7EqJtq98hPqEX7fNZaFWoOeR6V9Ezg4Q8VE3d2r0Rk5v0zzakDxG6',
			pg_catalog.now(),
			pg_catalog.now(),
			pg_catalog.now(),
			'{}'::jsonb,
			'{}'::jsonb
		),
		(
			v_auth_customer_b,
			'authenticated',
			'authenticated',
			'im_idem_customer_b_130@example.local',
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
			'im_idem_admin_130@example.local',
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
			v_auth_customer_a,
			'Idem',
			'CustomerA',
			'Idem CustomerA',
			'5551303001',
			'im_idem_customer_a_130@example.local',
			'CA'
		),
		(
			v_customer_b,
			v_auth_customer_b,
			'Idem',
			'CustomerB',
			'Idem CustomerB',
			'5551303002',
			'im_idem_customer_b_130@example.local',
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
			v_auth_customer_a,
			'customer',
			v_customer_a,
			'Idem',
			'CustomerA',
			'5551303001',
			true
		),
		(
			v_auth_customer_b,
			'customer',
			v_customer_b,
			'Idem',
			'CustomerB',
			'5551303002',
			true
		),
		(
			v_auth_admin,
			'admin',
			null,
			'Idem',
			'Admin',
			'5551303003',
			true
		);
end;
$$;

set local role authenticated;

do $$
declare
	v_auth_customer_a uuid := '90909090-9090-4090-8090-909090909090';
	v_auth_customer_b uuid := '91919191-9191-4191-8191-919191919191';
	v_auth_admin uuid := '92929292-9292-4292-8292-929292929292';
	v_result_first jsonb;
	v_result_retry jsonb;
	v_result_admin_first jsonb;
	v_result_admin_retry jsonb;
	v_result_mismatch jsonb;
	v_expected_error boolean;
	v_message_id_first uuid;
	v_message_id_retry uuid;
	v_admin_message_id_first uuid;
	v_admin_message_id_retry uuid;
	v_conversation_id uuid;
	v_direct_customer_read_count integer := 0;
	v_path_customer text;
	v_send_with_attachment jsonb;
	v_send_retry_with_attachment jsonb;
	v_attached_message_id uuid;
	v_attached_retry_message_id uuid;
	v_now timestamptz := pg_catalog.now();
begin
	if current_user <> 'authenticated' then
		raise exception 'Idempotency test failed: SQL role switch did not apply (current_user=%)', current_user;
	end if;

	perform set_config('request.jwt.claim.sub', v_auth_customer_a::text, true);
	perform set_config('request.jwt.claim.role', 'authenticated', true);
	perform set_config(
		'request.jwt.claims',
		pg_catalog.json_build_object(
			'sub', v_auth_customer_a::text,
			'role', 'authenticated',
			'aud', 'authenticated'
		)::text,
		true
	);

	v_result_first := public.send_my_internal_message(
		'40000000-0000-4000-8000-000000000001'::uuid,
		'Idempotent customer send',
		'[]'::jsonb
	);

	if coalesce((v_result_first ->> 'success')::boolean, false) is not true then
		raise exception 'Idempotency test failed: first customer send failed: %', v_result_first;
	end if;

	v_conversation_id := nullif(v_result_first ->> 'conversation_id', '')::uuid;
	v_message_id_first := nullif(v_result_first ->> 'message_id', '')::uuid;

	if v_conversation_id is null or v_message_id_first is null then
		raise exception 'Idempotency test failed: first customer send returned null ids: %', v_result_first;
	end if;

	perform set_config('test130.idem_conversation_id', v_conversation_id::text, true);
	perform set_config('test130.idem_customer_message_id', v_message_id_first::text, true);

	select count(*)
	into v_direct_customer_read_count
	from public.crm_messages m
	where m.conversation_id = v_conversation_id
		and m.channel = 'internal';

	if v_direct_customer_read_count <> 0 then
		raise exception 'Idempotency test failed: customer unexpectedly reads crm_messages directly (count=%)', v_direct_customer_read_count;
	end if;

	v_result_retry := public.send_my_internal_message(
		'40000000-0000-4000-8000-000000000001'::uuid,
		'Idempotent customer send',
		'[]'::jsonb
	);

	v_message_id_retry := nullif(v_result_retry ->> 'message_id', '')::uuid;

	if v_message_id_retry is distinct from v_message_id_first then
		raise exception 'Idempotency test failed: customer retry returned different message_id (first=%, retry=%)', v_message_id_first, v_message_id_retry;
	end if;

	if coalesce((v_result_retry ->> 'idempotent_replay')::boolean, false) is not true then
		raise exception 'Idempotency test failed: customer retry should be marked idempotent_replay, got %', v_result_retry;
	end if;

	v_expected_error := false;
	begin
		v_result_mismatch := public.send_my_internal_message(
			'40000000-0000-4000-8000-000000000001'::uuid,
			'Idempotent customer send changed body',
			'[]'::jsonb
		);
	exception
		when others then
			if pg_catalog.strpos(sqlerrm, 'idempotency_key_reused_with_different_payload') > 0 then
				v_expected_error := true;
			else
				raise;
			end if;
	end;

	if not v_expected_error then
		raise exception 'Idempotency test failed: customer mismatched payload unexpectedly succeeded: %', v_result_mismatch;
	end if;

	v_path_customer := v_conversation_id::text || '/2026/10/99999999-aaaa-4aaa-8aaa-aaaaaaaaaaaa-idem-customer.pdf';
	perform set_config('test130.idem_path_customer', v_path_customer, true);
	perform set_config('test130.idem_path_customer_size', '1024', true);

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

	v_result_admin_first := public.admin_reply_internal_conversation(
		v_conversation_id,
		'40000000-0000-4000-8000-000000000010'::uuid,
		'Idempotent admin send',
		'[]'::jsonb
	);

	if coalesce((v_result_admin_first ->> 'success')::boolean, false) is not true then
		raise exception 'Idempotency test failed: first admin send failed: %', v_result_admin_first;
	end if;

	v_admin_message_id_first := nullif(v_result_admin_first ->> 'message_id', '')::uuid;
	if v_admin_message_id_first is null then
		raise exception 'Idempotency test failed: first admin send returned null message_id: %', v_result_admin_first;
	end if;

	perform set_config('test130.idem_admin_message_id', v_admin_message_id_first::text, true);

	v_result_admin_retry := public.admin_reply_internal_conversation(
		v_conversation_id,
		'40000000-0000-4000-8000-000000000010'::uuid,
		'Idempotent admin send',
		'[]'::jsonb
	);

	v_admin_message_id_retry := nullif(v_result_admin_retry ->> 'message_id', '')::uuid;

	if v_admin_message_id_retry is distinct from v_admin_message_id_first then
		raise exception 'Idempotency test failed: admin retry returned different message_id (first=%, retry=%)', v_admin_message_id_first, v_admin_message_id_retry;
	end if;

	if coalesce((v_result_admin_retry ->> 'idempotent_replay')::boolean, false) is not true then
		raise exception 'Idempotency test failed: admin retry should be marked idempotent_replay, got %', v_result_admin_retry;
	end if;

	v_expected_error := false;
	begin
		perform public.admin_reply_internal_conversation(
			v_conversation_id,
			'40000000-0000-4000-8000-000000000010'::uuid,
			'Idempotent admin changed body',
			'[]'::jsonb
		);
	exception
		when others then
			if pg_catalog.strpos(sqlerrm, 'idempotency_key_reused_with_different_payload') > 0 then
				v_expected_error := true;
			else
				raise;
			end if;
	end;

	if not v_expected_error then
		raise exception 'Idempotency test failed: admin mismatched payload unexpectedly succeeded';
	end if;

end;
$$;

reset role;

do $$
declare
	v_path_customer text := nullif(current_setting('test130.idem_path_customer', true), '');
	v_size integer := coalesce(nullif(current_setting('test130.idem_path_customer_size', true), '')::integer, 1024);
	v_now timestamptz := pg_catalog.now();
begin
	if current_user <> 'postgres' then
		raise exception 'Idempotency test failed: postgres storage setup role expected (current_user=%)', current_user;
	end if;

	if v_path_customer is null then
		raise exception 'Idempotency test failed: missing path for attachment setup';
	end if;

	insert into storage.objects (bucket_id, name, metadata, created_at, updated_at)
	values (
		'crm-attachments',
		v_path_customer,
		pg_catalog.jsonb_build_object('size', v_size, 'mimetype', 'application/pdf'),
		v_now,
		v_now
	)
	on conflict (bucket_id, name)
	do update set
		metadata = excluded.metadata,
		created_at = excluded.created_at,
		updated_at = excluded.updated_at;
end;
$$;

set local role service_role;

do $$
declare
	v_service_sub uuid := '93939393-9393-4393-8393-939393939393';
	v_auth_customer_a uuid := '90909090-9090-4090-8090-909090909090';
	v_conversation_id uuid := nullif(current_setting('test130.idem_conversation_id', true), '')::uuid;
	v_path_customer text := nullif(current_setting('test130.idem_path_customer', true), '');
	v_register_result jsonb;
begin
	if current_user <> 'service_role' then
		raise exception 'Idempotency test failed: service_role setup role expected (current_user=%)', current_user;
	end if;

	if v_conversation_id is null or v_path_customer is null then
		raise exception 'Idempotency test failed: missing conversation or storage path for attachment register setup';
	end if;

	perform set_config('request.jwt.claim.sub', v_service_sub::text, true);
	perform set_config('request.jwt.claim.role', 'service_role', true);
	perform set_config(
		'request.jwt.claims',
		pg_catalog.json_build_object(
			'sub', v_service_sub::text,
			'role', 'service_role',
			'aud', 'authenticated'
		)::text,
		true
	);

	v_register_result := public.register_internal_attachment_upload(
		v_conversation_id,
		v_path_customer,
		'customer',
		'40000000-0000-4000-8000-000000000020'::uuid,
		v_auth_customer_a
	);

	if coalesce((v_register_result ->> 'success')::boolean, false) is not true then
		raise exception 'Idempotency test failed: register_internal_attachment_upload setup failed: %', v_register_result;
	end if;
end;
$$;

set local role authenticated;

do $$
declare
	v_auth_customer_a uuid := '90909090-9090-4090-8090-909090909090';
	v_auth_customer_b uuid := '91919191-9191-4191-8191-919191919191';
	v_conversation_id uuid := nullif(current_setting('test130.idem_conversation_id', true), '')::uuid;
	v_path_customer text := nullif(current_setting('test130.idem_path_customer', true), '');
	v_send_with_attachment jsonb;
	v_send_retry_with_attachment jsonb;
	v_attached_message_id uuid;
	v_attached_retry_message_id uuid;
	v_result_first jsonb;
	v_result_retry jsonb;
	v_expected_error boolean;
begin
	if current_user <> 'authenticated' then
		raise exception 'Idempotency test failed: SQL role switch did not apply for attachment/auth replay checks (current_user=%)', current_user;
	end if;

	if v_conversation_id is null or v_path_customer is null then
		raise exception 'Idempotency test failed: missing conversation or path for authenticated attachment checks';
	end if;

	perform set_config('request.jwt.claim.sub', v_auth_customer_a::text, true);
	perform set_config('request.jwt.claim.role', 'authenticated', true);
	perform set_config(
		'request.jwt.claims',
		pg_catalog.json_build_object(
			'sub', v_auth_customer_a::text,
			'role', 'authenticated',
			'aud', 'authenticated'
		)::text,
		true
	);

	v_send_with_attachment := public.send_my_internal_message(
		'40000000-0000-4000-8000-000000000021'::uuid,
		'Customer send with attachment',
		pg_catalog.jsonb_build_array(
			pg_catalog.jsonb_build_object(
				'storagePath', v_path_customer,
				'name', 'idem-customer.pdf',
				'mimeType', 'application/pdf',
				'type', 'file',
				'size', 1024
			)
		)
	);

	v_attached_message_id := nullif(v_send_with_attachment ->> 'message_id', '')::uuid;
	if v_attached_message_id is null then
		raise exception 'Idempotency test failed: send with attachment returned null message id: %', v_send_with_attachment;
	end if;
	perform set_config('test130.idem_attached_message_id', v_attached_message_id::text, true);

	v_send_retry_with_attachment := public.send_my_internal_message(
		'40000000-0000-4000-8000-000000000021'::uuid,
		'Customer send with attachment',
		pg_catalog.jsonb_build_array(
			pg_catalog.jsonb_build_object(
				'storagePath', v_path_customer,
				'name', 'idem-customer.pdf',
				'mimeType', 'application/pdf',
				'type', 'file',
				'size', 1024
			)
		)
	);

	v_attached_retry_message_id := nullif(v_send_retry_with_attachment ->> 'message_id', '')::uuid;
	if v_attached_retry_message_id is distinct from v_attached_message_id then
		raise exception 'Idempotency test failed: attachment retry returned different message id (first=%, retry=%)', v_attached_message_id, v_attached_retry_message_id;
	end if;

	if coalesce((v_send_retry_with_attachment ->> 'idempotent_replay')::boolean, false) is not true then
		raise exception 'Idempotency test failed: attachment retry should be replay, got %', v_send_retry_with_attachment;
	end if;

	perform set_config('request.jwt.claim.sub', v_auth_customer_b::text, true);
	perform set_config('request.jwt.claim.role', 'authenticated', true);
	perform set_config(
		'request.jwt.claims',
		pg_catalog.json_build_object(
			'sub', v_auth_customer_b::text,
			'role', 'authenticated',
			'aud', 'authenticated'
		)::text,
		true
	);

	v_expected_error := false;
	begin
		perform public.send_my_internal_message(
			'40000000-0000-4000-8000-000000000031'::uuid,
			'Cross-user attachment access attempt',
			pg_catalog.jsonb_build_array(
				pg_catalog.jsonb_build_object(
					'storagePath', v_path_customer,
					'name', 'idem-customer.pdf',
					'mimeType', 'application/pdf',
					'type', 'file',
					'size', 1024
				)
			)
		);
	exception
		when others then
			if pg_catalog.strpos(sqlerrm, 'forbidden') > 0
				or pg_catalog.strpos(sqlerrm, 'attachment_conversation_mismatch') > 0
				or pg_catalog.strpos(sqlerrm, 'attachment_owner_mismatch') > 0 then
				v_expected_error := true;
			else
				raise;
			end if;
	end;

	if not v_expected_error then
		raise exception 'Idempotency test failed: cross-customer replay unexpectedly succeeded';
	end if;

	-- Concurrency safety simulation: second attempt in same transaction sees idempotency row.
	perform set_config('request.jwt.claim.sub', v_auth_customer_a::text, true);
	perform set_config('request.jwt.claim.role', 'authenticated', true);
	perform set_config(
		'request.jwt.claims',
		pg_catalog.json_build_object(
			'sub', v_auth_customer_a::text,
			'role', 'authenticated',
			'aud', 'authenticated'
		)::text,
		true
	);

	v_result_first := public.send_my_internal_message(
		'40000000-0000-4000-8000-000000000099'::uuid,
		'Concurrent duplicate simulation',
		'[]'::jsonb
	);
	v_result_retry := public.send_my_internal_message(
		'40000000-0000-4000-8000-000000000099'::uuid,
		'Concurrent duplicate simulation',
		'[]'::jsonb
	);

	if nullif(v_result_first ->> 'message_id', '')::uuid is distinct from nullif(v_result_retry ->> 'message_id', '')::uuid then
		raise exception 'Idempotency test failed: concurrency simulation returned different ids (first=%, retry=%)', v_result_first, v_result_retry;
	end if;
end;
$$;

reset role;

do $$
declare
	v_conversation_id uuid := nullif(current_setting('test130.idem_conversation_id', true), '')::uuid;
	v_customer_message_id uuid := nullif(current_setting('test130.idem_customer_message_id', true), '')::uuid;
	v_admin_message_id uuid := nullif(current_setting('test130.idem_admin_message_id', true), '')::uuid;
	v_attached_message_id uuid := nullif(current_setting('test130.idem_attached_message_id', true), '')::uuid;
	v_inbound_base_count integer := 0;
	v_outbound_admin_count integer := 0;
	v_inbound_attachment_count integer := 0;
	v_inbound_concurrency_count integer := 0;
	v_unread_count integer := 0;
	v_customer_unread_count integer := 0;
	v_consumed_by uuid;
	v_path_customer text;
begin
	if current_user <> 'postgres' then
		raise exception 'Idempotency test failed: postgres assertion role expected (current_user=%)', current_user;
	end if;

	if v_conversation_id is null
		or v_customer_message_id is null
		or v_admin_message_id is null
		or v_attached_message_id is null then
		raise exception 'Idempotency test failed: missing ids from authenticated scenario settings';
	end if;

	select count(*)
	into v_inbound_base_count
	from public.crm_messages m
	where m.conversation_id = v_conversation_id
		and m.channel = 'internal'
		and m.direction = 'inbound'
		and coalesce(m.body_text, '') = 'Idempotent customer send';

	if v_inbound_base_count <> 1 then
		raise exception 'Idempotency test failed: customer duplicate created unexpected persisted rows (count=%)', v_inbound_base_count;
	end if;

	select count(*)
	into v_outbound_admin_count
	from public.crm_messages m
	where m.conversation_id = v_conversation_id
		and m.channel = 'internal'
		and m.direction = 'outbound'
		and coalesce(m.body_text, '') = 'Idempotent admin send';

	if v_outbound_admin_count <> 1 then
		raise exception 'Idempotency test failed: admin duplicate created unexpected persisted rows (count=%)', v_outbound_admin_count;
	end if;

	select count(*)
	into v_inbound_attachment_count
	from public.crm_messages m
	where m.conversation_id = v_conversation_id
		and m.channel = 'internal'
		and m.direction = 'inbound'
		and coalesce(m.body_text, '') = 'Customer send with attachment';

	if v_inbound_attachment_count <> 1 then
		raise exception 'Idempotency test failed: attachment retry duplicated message rows (count=%)', v_inbound_attachment_count;
	end if;

	select count(*)
	into v_inbound_concurrency_count
	from public.crm_messages m
	where m.conversation_id = v_conversation_id
		and m.channel = 'internal'
		and m.direction = 'inbound'
		and coalesce(m.body_text, '') = 'Concurrent duplicate simulation';

	if v_inbound_concurrency_count <> 1 then
		raise exception 'Idempotency test failed: concurrency duplicate simulation persisted unexpected row count (count=%)', v_inbound_concurrency_count;
	end if;

	select coalesce(c.unread_count, 0), coalesce(c.customer_unread_count, 0)
	into v_unread_count, v_customer_unread_count
	from public.crm_conversations c
	where c.id = v_conversation_id
		and c.conversation_scope = 'internal';

	if v_unread_count <> 3 then
		raise exception 'Idempotency test failed: expected unread_count=3 after non-duplicated retries, got %', v_unread_count;
	end if;

	if v_customer_unread_count <> 1 then
		raise exception 'Idempotency test failed: expected customer_unread_count=1 after non-duplicated admin retry, got %', v_customer_unread_count;
	end if;

	v_path_customer := v_conversation_id::text || '/2026/10/99999999-aaaa-4aaa-8aaa-aaaaaaaaaaaa-idem-customer.pdf';

	select u.consumed_by_message_id
	into v_consumed_by
	from public.crm_internal_attachment_uploads u
	where u.storage_path = v_path_customer;

	if v_consumed_by is distinct from v_attached_message_id then
		raise exception 'Idempotency test failed: attachment consumption row mismatch (expected consumed_by=%, actual=%)', v_attached_message_id, v_consumed_by;
	end if;

	if not exists (
		select 1
		from public.crm_messages m
		where m.id = v_customer_message_id
			and m.conversation_id = v_conversation_id
	) then
		raise exception 'Idempotency test failed: customer message id from RPC not found in crm_messages';
	end if;

	if not exists (
		select 1
		from public.crm_messages m
		where m.id = v_admin_message_id
			and m.conversation_id = v_conversation_id
	) then
		raise exception 'Idempotency test failed: admin message id from RPC not found in crm_messages';
	end if;
end;
$$;

rollback;
