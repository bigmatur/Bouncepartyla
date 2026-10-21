begin;

do $$
declare
	v_auth_a uuid := '55555555-5555-4555-8555-555555555555';
	v_auth_b uuid := '66666666-6666-4666-8666-666666666666';
	v_customer_a uuid := 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4';
	v_customer_b uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5';
	v_bucket_public boolean;
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
			'im_a_130_attachments_test@example.local',
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
			'im_b_130_attachments_test@example.local',
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
			'AttachA',
			'Internal AttachA',
			'5551302001',
			'im_a_130_attachments_test@example.local',
			'CA'
		),
		(
			v_customer_b,
			v_auth_b,
			'Internal',
			'AttachB',
			'Internal AttachB',
			'5551302002',
			'im_b_130_attachments_test@example.local',
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
			'AttachA',
			'5551302001',
			true
		),
		(
			v_auth_b,
			'customer',
			v_customer_b,
			'Internal',
			'AttachB',
			'5551302002',
			true
		);

	select b.public
	into v_bucket_public
	from storage.buckets b
	where b.id = 'crm-attachments'
	limit 1;

	if v_bucket_public is null then
		raise exception 'Attachments security test failed: crm-attachments bucket is missing';
	end if;

	if v_bucket_public then
		raise exception 'Attachments security test failed: crm-attachments bucket must be private';
	end if;
end;
$$;

set local role authenticated;

do $$
declare
	v_auth_a uuid := '55555555-5555-4555-8555-555555555555';
	v_auth_b uuid := '66666666-6666-4666-8666-666666666666';
	v_send_a jsonb;
	v_send_b jsonb;
begin
	if current_user <> 'authenticated' then
		raise exception 'Attachments security test failed: SQL role switch did not apply (current_user=%)', current_user;
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

	v_send_a := public.send_my_internal_message(
		'30000000-0000-4000-8000-000000000001'::uuid,
		'Bootstrap conversation A',
		'[]'::jsonb
	);
	if coalesce((v_send_a ->> 'success')::boolean, false) is not true then
		raise exception 'Attachments security test failed: bootstrap send for A failed: %', v_send_a;
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

	v_send_b := public.send_my_internal_message(
		'30000000-0000-4000-8000-000000000002'::uuid,
		'Bootstrap conversation B',
		'[]'::jsonb
	);
	if coalesce((v_send_b ->> 'success')::boolean, false) is not true then
		raise exception 'Attachments security test failed: bootstrap send for B failed: %', v_send_b;
	end if;
end;
$$;

reset role;

do $$
declare
	v_customer_a uuid := 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4';
	v_customer_b uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5';
	v_conversation_a uuid;
	v_conversation_b uuid;
	v_now timestamptz := pg_catalog.now();
	v_path_b_case1 text;
	v_path_a_reuse text;
	v_path_a_double text;
	v_path_a_sent_delete text;
	v_path_a_pending text;
	v_path_a_owner_guard text;
	v_path_a_mixed_pending_1 text;
	v_path_a_mixed_pending_2 text;
begin
	select c.id
	into v_conversation_a
	from public.crm_conversations c
	where c.customer_id = v_customer_a
		and c.conversation_scope = 'internal'
	limit 1;

	select c.id
	into v_conversation_b
	from public.crm_conversations c
	where c.customer_id = v_customer_b
		and c.conversation_scope = 'internal'
	limit 1;

	if v_conversation_a is null or v_conversation_b is null then
		raise exception 'Attachments security test failed: bootstrap conversations not found';
	end if;

	perform set_config('test130.conversation_a', v_conversation_a::text, true);
	perform set_config('test130.conversation_b', v_conversation_b::text, true);

	v_path_b_case1 := v_conversation_b::text || '/2026/10/11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa-b-case1.pdf';
	v_path_a_reuse := v_conversation_a::text || '/2026/10/22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb-a-reuse.pdf';
	v_path_a_double := v_conversation_a::text || '/2026/10/33333333-cccc-4ccc-8ccc-cccccccccccc-a-double.pdf';
	v_path_a_sent_delete := v_conversation_a::text || '/2026/10/44444444-dddd-4ddd-8ddd-dddddddddddd-a-sent-delete.pdf';
	v_path_a_pending := v_conversation_a::text || '/2026/10/55555555-eeee-4eee-8eee-eeeeeeeeeeee-a-pending.pdf';
	v_path_a_owner_guard := v_conversation_a::text || '/2026/10/66666666-ffff-4fff-8fff-ffffffffffff-a-owner-guard.pdf';
	v_path_a_mixed_pending_1 := v_conversation_a::text || '/2026/10/77777777-aaaa-4aaa-8aaa-aaaaaaaaaaaa-a-mixed-pending-1.pdf';
	v_path_a_mixed_pending_2 := v_conversation_a::text || '/2026/10/88888888-bbbb-4bbb-8bbb-bbbbbbbbbbbb-a-mixed-pending-2.pdf';

	insert into storage.objects (bucket_id, name, metadata, created_at, updated_at)
	values
		(
			'crm-attachments',
			v_path_b_case1,
			pg_catalog.jsonb_build_object('size', 2048, 'mimetype', 'application/pdf'),
			v_now,
			v_now
		),
		(
			'crm-attachments',
			v_path_a_reuse,
			pg_catalog.jsonb_build_object('size', 3072, 'mimetype', 'application/pdf'),
			v_now,
			v_now
		),
		(
			'crm-attachments',
			v_path_a_double,
			pg_catalog.jsonb_build_object('size', 4096, 'mimetype', 'application/pdf'),
			v_now,
			v_now
		),
		(
			'crm-attachments',
			v_path_a_sent_delete,
			pg_catalog.jsonb_build_object('size', 5120, 'mimetype', 'application/pdf'),
			v_now,
			v_now
		),
		(
			'crm-attachments',
			v_path_a_pending,
			pg_catalog.jsonb_build_object('size', 6144, 'mimetype', 'application/pdf'),
			v_now,
			v_now
		),
		(
			'crm-attachments',
			v_path_a_owner_guard,
			pg_catalog.jsonb_build_object('size', 7168, 'mimetype', 'application/pdf'),
			v_now,
			v_now
		),
		(
			'crm-attachments',
			v_path_a_mixed_pending_1,
			pg_catalog.jsonb_build_object('size', 4097, 'mimetype', 'application/pdf'),
			v_now,
			v_now
		),
		(
			'crm-attachments',
			v_path_a_mixed_pending_2,
			pg_catalog.jsonb_build_object('size', 4098, 'mimetype', 'application/pdf'),
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
	v_service_sub uuid := '77777777-7777-4777-8777-777777777777';
	v_auth_a uuid := '55555555-5555-4555-8555-555555555555';
	v_auth_b uuid := '66666666-6666-4666-8666-666666666666';
	v_customer_a uuid := 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4';
	v_customer_b uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5';
	v_conversation_a uuid;
	v_conversation_b uuid;
	v_path_b_case1 text;
	v_path_a_reuse text;
	v_path_a_double text;
	v_path_a_sent_delete text;
	v_path_a_pending text;
	v_path_a_owner_guard text;
	v_path_a_mixed_pending_1 text;
	v_path_a_mixed_pending_2 text;
	v_result jsonb;
begin
	if current_user <> 'service_role' then
		raise exception 'Attachments security test failed: SQL role switch to service_role did not apply (current_user=%)', current_user;
	end if;

	select c.id
	into v_conversation_a
	from public.crm_conversations c
	where c.customer_id = v_customer_a
		and c.conversation_scope = 'internal'
	limit 1;

	select c.id
	into v_conversation_b
	from public.crm_conversations c
	where c.customer_id = v_customer_b
		and c.conversation_scope = 'internal'
	limit 1;

	if v_conversation_a is null or v_conversation_b is null then
		raise exception 'Attachments security test failed: required conversations are missing';
	end if;

	v_path_b_case1 := v_conversation_b::text || '/2026/10/11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa-b-case1.pdf';
	v_path_a_reuse := v_conversation_a::text || '/2026/10/22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb-a-reuse.pdf';
	v_path_a_double := v_conversation_a::text || '/2026/10/33333333-cccc-4ccc-8ccc-cccccccccccc-a-double.pdf';
	v_path_a_sent_delete := v_conversation_a::text || '/2026/10/44444444-dddd-4ddd-8ddd-dddddddddddd-a-sent-delete.pdf';
	v_path_a_pending := v_conversation_a::text || '/2026/10/55555555-eeee-4eee-8eee-eeeeeeeeeeee-a-pending.pdf';
	v_path_a_owner_guard := v_conversation_a::text || '/2026/10/66666666-ffff-4fff-8fff-ffffffffffff-a-owner-guard.pdf';
	v_path_a_mixed_pending_1 := v_conversation_a::text || '/2026/10/77777777-aaaa-4aaa-8aaa-aaaaaaaaaaaa-a-mixed-pending-1.pdf';
	v_path_a_mixed_pending_2 := v_conversation_a::text || '/2026/10/88888888-bbbb-4bbb-8bbb-bbbbbbbbbbbb-a-mixed-pending-2.pdf';

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

	v_result := public.register_internal_attachment_upload(
		v_conversation_b,
		v_path_b_case1,
		'customer',
		'00000000-0000-4000-8000-000000000001'::uuid,
		v_auth_b
	);
	if coalesce((v_result ->> 'success')::boolean, false) is not true then
		raise exception 'Attachments security test failed: register B file failed: %', v_result;
	end if;

	v_result := public.register_internal_attachment_upload(
		v_conversation_a,
		v_path_a_reuse,
		'customer',
		'00000000-0000-4000-8000-000000000002'::uuid,
		v_auth_a
	);
	if coalesce((v_result ->> 'success')::boolean, false) is not true then
		raise exception 'Attachments security test failed: register A reuse file failed: %', v_result;
	end if;

	v_result := public.register_internal_attachment_upload(
		v_conversation_a,
		v_path_a_double,
		'customer',
		'00000000-0000-4000-8000-000000000003'::uuid,
		v_auth_a
	);
	if coalesce((v_result ->> 'success')::boolean, false) is not true then
		raise exception 'Attachments security test failed: register A double file failed: %', v_result;
	end if;

	v_result := public.register_internal_attachment_upload(
		v_conversation_a,
		v_path_a_sent_delete,
		'customer',
		'00000000-0000-4000-8000-000000000004'::uuid,
		v_auth_a
	);
	if coalesce((v_result ->> 'success')::boolean, false) is not true then
		raise exception 'Attachments security test failed: register A sent-delete file failed: %', v_result;
	end if;

	v_result := public.register_internal_attachment_upload(
		v_conversation_a,
		v_path_a_pending,
		'customer',
		'00000000-0000-4000-8000-000000000005'::uuid,
		v_auth_a
	);
	if coalesce((v_result ->> 'success')::boolean, false) is not true then
		raise exception 'Attachments security test failed: register A pending file failed: %', v_result;
	end if;

	v_result := public.register_internal_attachment_upload(
		v_conversation_a,
		v_path_a_owner_guard,
		'customer',
		'00000000-0000-4000-8000-000000000006'::uuid,
		v_auth_a
	);
	if coalesce((v_result ->> 'success')::boolean, false) is not true then
		raise exception 'Attachments security test failed: register A owner-guard file failed: %', v_result;
	end if;

	v_result := public.register_internal_attachment_upload(
		v_conversation_a,
		v_path_a_mixed_pending_1,
		'customer',
		'00000000-0000-4000-8000-000000000007'::uuid,
		v_auth_a
	);
	if coalesce((v_result ->> 'success')::boolean, false) is not true then
		raise exception 'Attachments security test failed: register A mixed-pending-1 file failed: %', v_result;
	end if;

	v_result := public.register_internal_attachment_upload(
		v_conversation_a,
		v_path_a_mixed_pending_2,
		'customer',
		'00000000-0000-4000-8000-000000000008'::uuid,
		v_auth_a
	);
	if coalesce((v_result ->> 'success')::boolean, false) is not true then
		raise exception 'Attachments security test failed: register A mixed-pending-2 file failed: %', v_result;
	end if;
end;
$$;

reset role;

do $$
declare
	v_conversation_a uuid := nullif(current_setting('test130.conversation_a', true), '')::uuid;
	v_auth_a uuid := '55555555-5555-4555-8555-555555555555';
	v_path_a_mixed_pending_1 text;
	v_path_a_mixed_pending_2 text;
	v_case7_token_a uuid := '12121212-1212-4121-8121-121212121212';
	v_case7_token_b uuid := '34343434-3434-4343-8343-343434343434';
begin
	if current_user <> 'postgres' then
		raise exception 'Attachments security test failed: postgres case 7 preparation role expected (current_user=%)', current_user;
	end if;

	if v_conversation_a is null then
		raise exception 'Attachments security test failed: case 7 missing conversation A from settings';
	end if;

	v_path_a_mixed_pending_1 := v_conversation_a::text || '/2026/10/77777777-aaaa-4aaa-8aaa-aaaaaaaaaaaa-a-mixed-pending-1.pdf';
	v_path_a_mixed_pending_2 := v_conversation_a::text || '/2026/10/88888888-bbbb-4bbb-8bbb-bbbbbbbbbbbb-a-mixed-pending-2.pdf';

	update public.crm_internal_attachment_uploads
	set deletion_status = 'pending_delete',
		deletion_token = v_case7_token_a
	where storage_path = v_path_a_mixed_pending_1
		and conversation_id = v_conversation_a
		and uploaded_by = v_auth_a
		and uploaded_as = 'customer'
		and consumed_by_message_id is null;

	if not found then
		raise exception 'Attachments security test failed: case 7 could not mark first mixed pending attachment';
	end if;

	update public.crm_internal_attachment_uploads
	set deletion_status = 'pending_delete',
		deletion_token = v_case7_token_b
	where storage_path = v_path_a_mixed_pending_2
		and conversation_id = v_conversation_a
		and uploaded_by = v_auth_a
		and uploaded_as = 'customer'
		and consumed_by_message_id is null;

	if not found then
		raise exception 'Attachments security test failed: case 7 could not mark second mixed pending attachment';
	end if;
end;
$$;

set local role authenticated;

do $$
declare
	v_auth_a uuid := '55555555-5555-4555-8555-555555555555';
	v_auth_b uuid := '66666666-6666-4666-8666-666666666666';
	v_conversation_a uuid;
	v_conversation_b uuid;
	v_path_b_case1 text;
	v_path_a_reuse text;
	v_path_a_double text;
	v_path_a_sent_delete text;
	v_path_a_pending text;
	v_path_a_owner_guard text;
	v_path_a_mixed_pending_1 text;
	v_path_a_mixed_pending_2 text;
	v_result jsonb;
	v_deleted text[];
	v_len integer;
	v_msg jsonb;
	v_expected_error boolean;
	v_case7_token_a uuid := '12121212-1212-4121-8121-121212121212';
	v_case7_token_b uuid := '34343434-3434-4343-8343-343434343434';
	v_case7_token_c uuid := '56565656-5656-4565-8565-565656565656';
	v_case7_effective_token uuid;
	v_case7_path_count integer := 0;
	v_case7_paths text[] := '{}'::text[];
	v_case7_has_first boolean := false;
	v_case7_has_second boolean := false;
	v_token_case4 uuid := '88888888-8888-4888-8888-888888888888';
	v_token_case5_good uuid := '99999999-9999-4999-8999-999999999999';
	v_token_case5_bad uuid := 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
	v_token_case6 uuid := 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
begin
	if current_user <> 'authenticated' then
		raise exception 'Attachments security test failed: SQL role switch to authenticated did not apply (current_user=%)', current_user;
	end if;

	v_conversation_a := nullif(current_setting('test130.conversation_a', true), '')::uuid;
	v_conversation_b := nullif(current_setting('test130.conversation_b', true), '')::uuid;

	if v_conversation_a is null or v_conversation_b is null then
		raise exception 'Attachments security test failed: required conversations are missing';
	end if;

	v_path_b_case1 := v_conversation_b::text || '/2026/10/11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa-b-case1.pdf';
	v_path_a_reuse := v_conversation_a::text || '/2026/10/22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb-a-reuse.pdf';
	v_path_a_double := v_conversation_a::text || '/2026/10/33333333-cccc-4ccc-8ccc-cccccccccccc-a-double.pdf';
	v_path_a_sent_delete := v_conversation_a::text || '/2026/10/44444444-dddd-4ddd-8ddd-dddddddddddd-a-sent-delete.pdf';
	v_path_a_pending := v_conversation_a::text || '/2026/10/55555555-eeee-4eee-8eee-eeeeeeeeeeee-a-pending.pdf';
	v_path_a_owner_guard := v_conversation_a::text || '/2026/10/66666666-ffff-4fff-8fff-ffffffffffff-a-owner-guard.pdf';
	v_path_a_mixed_pending_1 := v_conversation_a::text || '/2026/10/77777777-aaaa-4aaa-8aaa-aaaaaaaaaaaa-a-mixed-pending-1.pdf';
	v_path_a_mixed_pending_2 := v_conversation_a::text || '/2026/10/88888888-bbbb-4bbb-8bbb-bbbbbbbbbbbb-a-mixed-pending-2.pdf';

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

	v_expected_error := false;
	begin
		perform public.send_my_internal_message(
			'30000000-0000-4000-8000-000000000003'::uuid,
			'Case 1: A tries to attach B file',
			pg_catalog.jsonb_build_array(
				pg_catalog.jsonb_build_object(
					'storagePath', v_path_b_case1,
					'name', 'b-case1.pdf',
					'mimeType', 'application/pdf',
					'type', 'file',
					'size', 2048
				)
			)
		);
	exception
		when others then
			if pg_catalog.strpos(sqlerrm, 'attachment_conversation_mismatch') > 0 then
				v_expected_error := true;
			else
				raise;
			end if;
	end;

	if not v_expected_error then
		raise exception 'Attachments security test failed: case 1 RPC unexpectedly succeeded';
	end if;

	v_msg := public.send_my_internal_message(
		'30000000-0000-4000-8000-000000000004'::uuid,
		'Case 2: first send consumes attachment',
		pg_catalog.jsonb_build_array(
			pg_catalog.jsonb_build_object(
				'storagePath', v_path_a_reuse,
				'name', 'a-reuse.pdf',
				'mimeType', 'application/pdf',
				'type', 'file',
				'size', 3072
			)
		)
	);
	if coalesce((v_msg ->> 'success')::boolean, false) is not true then
		raise exception 'Attachments security test failed: case 2 first send failed: %', v_msg;
	end if;

	v_expected_error := false;
	begin
		perform public.send_my_internal_message(
			'30000000-0000-4000-8000-000000000005'::uuid,
			'Case 2: second send reuses consumed attachment',
			pg_catalog.jsonb_build_array(
				pg_catalog.jsonb_build_object(
					'storagePath', v_path_a_reuse,
					'name', 'a-reuse.pdf',
					'mimeType', 'application/pdf',
					'type', 'file',
					'size', 3072
				)
			)
		);
	exception
		when others then
			if pg_catalog.strpos(sqlerrm, 'attachment_already_consumed') > 0 then
				v_expected_error := true;
			else
				raise;
			end if;
	end;

	if not v_expected_error then
		raise exception 'Attachments security test failed: case 2 RPC unexpectedly succeeded';
	end if;

	v_expected_error := false;
	begin
		perform public.send_my_internal_message(
			'30000000-0000-4000-8000-000000000006'::uuid,
			'Case 3: same file listed twice in one message',
			pg_catalog.jsonb_build_array(
				pg_catalog.jsonb_build_object(
					'storagePath', v_path_a_double,
					'name', 'a-double.pdf',
					'mimeType', 'application/pdf',
					'type', 'file',
					'size', 4096
				),
				pg_catalog.jsonb_build_object(
					'storagePath', v_path_a_double,
					'name', 'a-double.pdf',
					'mimeType', 'application/pdf',
					'type', 'file',
					'size', 4096
				)
			)
		);
	exception
		when others then
			if pg_catalog.strpos(sqlerrm, 'attachment_already_consumed') > 0 then
				v_expected_error := true;
			else
				raise;
			end if;
	end;

	if not v_expected_error then
		raise exception 'Attachments security test failed: case 3 RPC unexpectedly succeeded';
	end if;

	v_msg := public.send_my_internal_message(
		'30000000-0000-4000-8000-000000000007'::uuid,
		'Case 4: create consumed attachment for delete guard',
		pg_catalog.jsonb_build_array(
			pg_catalog.jsonb_build_object(
				'storagePath', v_path_a_sent_delete,
				'name', 'a-sent-delete.pdf',
				'mimeType', 'application/pdf',
				'type', 'file',
				'size', 5120
			)
		)
	);
	if coalesce((v_msg ->> 'success')::boolean, false) is not true then
		raise exception 'Attachments security test failed: case 4 send failed: %', v_msg;
	end if;

	v_result := public.safe_remove_internal_upload_attachments(
		v_conversation_a,
		array[v_path_a_sent_delete],
		v_token_case4
	);
	v_len := coalesce(pg_catalog.jsonb_array_length(coalesce(v_result -> 'storage_paths', '[]'::jsonb)), 0);
	if v_len <> 0 then
		raise exception 'Attachments security test failed: case 4 expected no deletable sent attachments, got %', v_result;
	end if;

	v_result := public.safe_remove_internal_upload_attachments(
		v_conversation_a,
		array[v_path_a_pending],
		v_token_case5_good
	);
	v_len := coalesce(pg_catalog.jsonb_array_length(coalesce(v_result -> 'storage_paths', '[]'::jsonb)), 0);
	if v_len <> 1 then
		raise exception 'Attachments security test failed: case 5 mark phase expected exactly one path, got %', v_result;
	end if;

	v_deleted := public.finalize_internal_upload_attachments_deletion(
		v_conversation_a,
		array[v_path_a_pending],
		v_token_case5_bad
	);
	if coalesce(array_length(v_deleted, 1), 0) <> 0 then
		raise exception 'Attachments security test failed: case 5 wrong token should delete nothing, got %', v_deleted;
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

	v_expected_error := false;
	begin
		perform public.safe_remove_internal_upload_attachments(
			v_conversation_a,
			array[v_path_a_owner_guard],
			v_token_case6
		);
	exception
		when others then
			if pg_catalog.strpos(sqlerrm, 'forbidden') > 0 then
				v_expected_error := true;
			else
				raise;
			end if;
	end;

	if not v_expected_error then
		raise exception 'Attachments security test failed: case 6 RPC unexpectedly succeeded';
	end if;

	perform set_config('request.jwt.claim.sub', v_auth_a::text, true);
	perform set_config('request.jwt.claim.role', 'authenticated', true);
	perform set_config('request.jwt.claims', pg_catalog.json_build_object('sub', v_auth_a::text, 'role', 'authenticated', 'aud', 'authenticated')::text, true);

	v_result := public.safe_remove_internal_upload_attachments(
		v_conversation_a,
		array[v_path_a_mixed_pending_1, v_path_a_mixed_pending_2],
		v_case7_token_c
	);

	v_case7_effective_token := nullif(v_result ->> 'deletion_token', '')::uuid;
	v_case7_paths := coalesce(
		(
			select pg_catalog.array_agg(p)
			from pg_catalog.jsonb_array_elements_text(
				coalesce(v_result -> 'storage_paths', '[]'::jsonb)
			) as p
		),
		'{}'::text[]
	);
	v_case7_path_count := coalesce(array_length(v_case7_paths, 1), 0);

	if v_case7_path_count = 0 then
		raise exception 'Attachments security test failed: case 7 expected at least one removable path for mixed pending retry, got %', v_result;
	end if;

	if v_case7_path_count > 2 then
		raise exception 'Attachments security test failed: case 7 returned unexpected number of paths (count=%), payload=%', v_case7_path_count, v_result;
	end if;

	v_case7_has_first := v_path_a_mixed_pending_1 = any(v_case7_paths);
	v_case7_has_second := v_path_a_mixed_pending_2 = any(v_case7_paths);

	if not v_case7_has_first and not v_case7_has_second then
		raise exception 'Attachments security test failed: case 7 returned paths unrelated to mixed pending attachments: %', v_result;
	end if;

	if v_case7_path_count = 1 then
		raise notice 'Attachments security test case 7 limitation observed: only one pending path was returned for mixed deletion tokens (payload=%)', v_result;
	end if;

	if v_case7_path_count = 2 and (not v_case7_has_first or not v_case7_has_second) then
		raise exception 'Attachments security test failed: case 7 expected both mixed pending paths when two entries returned, got %', v_result;
	end if;

	if v_case7_effective_token is null then
		raise exception 'Attachments security test failed: case 7 effective deletion token is null, payload=%', v_result;
	end if;

	if v_case7_effective_token is distinct from v_case7_token_a
		and v_case7_effective_token is distinct from v_case7_token_b then
		raise exception 'Attachments security test failed: case 7 effective token (%) is unexpected for mixed pending retry payload=%', v_case7_effective_token, v_result;
	end if;

end;
$$;

reset role;

do $$
declare
	v_customer_a uuid := 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4';
	v_customer_b uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5';
	v_conversation_a uuid;
	v_conversation_b uuid;
	v_path_a_sent_delete text;
	v_path_a_pending text;
	v_path_a_owner_guard text;
	v_path_a_mixed_pending_1 text;
	v_path_a_mixed_pending_2 text;
	v_status text;
	v_token_db uuid;
	v_consumed_by uuid;
	v_case7_token_a uuid := '12121212-1212-4121-8121-121212121212';
	v_case7_token_b uuid := '34343434-3434-4343-8343-343434343434';
	v_token_case5_good uuid := '99999999-9999-4999-8999-999999999999';
begin
	if current_user <> 'postgres' then
		raise exception 'Attachments security test failed: postgres state-check role expected (current_user=%)', current_user;
	end if;

	select c.id
	into v_conversation_a
	from public.crm_conversations c
	where c.customer_id = v_customer_a
		and c.conversation_scope = 'internal'
	limit 1;

	select c.id
	into v_conversation_b
	from public.crm_conversations c
	where c.customer_id = v_customer_b
		and c.conversation_scope = 'internal'
	limit 1;

	if v_conversation_a is null or v_conversation_b is null then
		raise exception 'Attachments security test failed: state-check conversations are missing';
	end if;

	v_path_a_sent_delete := v_conversation_a::text || '/2026/10/44444444-dddd-4ddd-8ddd-dddddddddddd-a-sent-delete.pdf';
	v_path_a_pending := v_conversation_a::text || '/2026/10/55555555-eeee-4eee-8eee-eeeeeeeeeeee-a-pending.pdf';
	v_path_a_owner_guard := v_conversation_a::text || '/2026/10/66666666-ffff-4fff-8fff-ffffffffffff-a-owner-guard.pdf';
	v_path_a_mixed_pending_1 := v_conversation_a::text || '/2026/10/77777777-aaaa-4aaa-8aaa-aaaaaaaaaaaa-a-mixed-pending-1.pdf';
	v_path_a_mixed_pending_2 := v_conversation_a::text || '/2026/10/88888888-bbbb-4bbb-8bbb-bbbbbbbbbbbb-a-mixed-pending-2.pdf';

	select u.deletion_status, u.deletion_token, u.consumed_by_message_id
	into v_status, v_token_db, v_consumed_by
	from public.crm_internal_attachment_uploads u
	where u.storage_path = v_path_a_sent_delete;

	if v_status is null then
		raise exception 'Attachments security test failed: case 4 row not found for %', v_path_a_sent_delete;
	end if;

	if v_status <> 'active' or v_token_db is not null or v_consumed_by is null then
		raise exception 'Attachments security test failed: case 4 row state changed unexpectedly (status=%, token=%, consumed_by=%)', v_status, v_token_db, v_consumed_by;
	end if;

	select u.deletion_status, u.deletion_token, u.consumed_by_message_id
	into v_status, v_token_db, v_consumed_by
	from public.crm_internal_attachment_uploads u
	where u.storage_path = v_path_a_pending;

	if v_status is null then
		raise exception 'Attachments security test failed: case 5 row not found for %', v_path_a_pending;
	end if;

	if v_status <> 'pending_delete' or v_token_db is distinct from v_token_case5_good or v_consumed_by is not null then
		raise exception 'Attachments security test failed: case 5 row state mismatch after wrong finalize token (status=%, token=%, consumed_by=%)', v_status, v_token_db, v_consumed_by;
	end if;

	select u.deletion_status, u.deletion_token, u.consumed_by_message_id
	into v_status, v_token_db, v_consumed_by
	from public.crm_internal_attachment_uploads u
	where u.storage_path = v_path_a_owner_guard;

	if v_status is null then
		raise exception 'Attachments security test failed: case 6 row not found for %', v_path_a_owner_guard;
	end if;

	if v_status <> 'active' or v_token_db is not null or v_consumed_by is not null then
		raise exception 'Attachments security test failed: case 6 row state changed unexpectedly (status=%, token=%, consumed_by=%)', v_status, v_token_db, v_consumed_by;
	end if;

	select u.deletion_status, u.deletion_token, u.consumed_by_message_id
	into v_status, v_token_db, v_consumed_by
	from public.crm_internal_attachment_uploads u
	where u.storage_path = v_path_a_mixed_pending_1;

	if v_status is null then
		raise exception 'Attachments security test failed: case 7 first mixed row not found for %', v_path_a_mixed_pending_1;
	end if;

	if v_status <> 'pending_delete' or v_token_db is distinct from v_case7_token_a or v_consumed_by is not null then
		raise exception 'Attachments security test failed: case 7 first mixed row state mismatch (status=%, token=%, consumed_by=%)', v_status, v_token_db, v_consumed_by;
	end if;

	select u.deletion_status, u.deletion_token, u.consumed_by_message_id
	into v_status, v_token_db, v_consumed_by
	from public.crm_internal_attachment_uploads u
	where u.storage_path = v_path_a_mixed_pending_2;

	if v_status is null then
		raise exception 'Attachments security test failed: case 7 second mixed row not found for %', v_path_a_mixed_pending_2;
	end if;

	if v_status <> 'pending_delete' or v_token_db is distinct from v_case7_token_b or v_consumed_by is not null then
		raise exception 'Attachments security test failed: case 7 second mixed row state mismatch (status=%, token=%, consumed_by=%)', v_status, v_token_db, v_consumed_by;
	end if;
end;
$$;

rollback;