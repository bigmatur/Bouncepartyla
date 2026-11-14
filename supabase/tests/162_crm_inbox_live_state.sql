begin;

select plan(3);

select has_function(
  'public',
  'get_crm_inbox_live_state',
  array[]::text[],
  'CRM live-state function exists'
);

select function_privs_are(
  'public',
  'get_crm_inbox_live_state',
  array[]::text[],
  'anon',
  array[]::text[],
  'anon cannot execute CRM live-state function'
);

select function_privs_are(
  'public',
  'get_crm_inbox_live_state',
  array[]::text[],
  'authenticated',
  array['EXECUTE'],
  'authenticated staff clients can execute CRM live-state function'
);

select * from finish();
rollback;
