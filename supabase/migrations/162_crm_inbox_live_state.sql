-- Compact CRM Inbox state used by the admin sidebar and inbox polling.
-- Returning only a revision and unread total avoids repeatedly loading the
-- complete conversation list when nothing has changed.

begin;

create or replace function public.get_crm_inbox_live_state()
returns table (
  revision text,
  unread_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_can_view boolean := false;
begin
  select coalesce(
    not (
      'customers.view' = any(
        coalesce(p.denied_permissions, '{}'::text[])
      )
    )
    and (
      'customers.view' = any(
        coalesce(p.permissions, '{}'::text[])
      )
      or exists (
        select 1
        from public.app_roles ar
        where (
          ar.key = p.role
          or ar.key = any(coalesce(p.additional_roles, '{}'::text[]))
        )
          and 'customers.view' = any(
            coalesce(ar.permissions, '{}'::text[])
          )
      )
    ),
    false
  )
  into v_can_view
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.is_active, true)
  limit 1;

  if not coalesce(v_can_view, false) then
    raise exception 'Insufficient permission to view CRM Inbox state'
      using errcode = '42501';
  end if;

  return query
  select
    coalesce(
      md5(
        string_agg(
          concat_ws(
            ':',
            c.id::text,
            coalesce(c.last_message_at::text, ''),
            greatest(coalesce(c.unread_count, 0), 0)::text,
            case when coalesce(c.needs_reply, false) then '1' else '0' end,
            coalesce(c.status::text, '')
          ),
          '|' order by c.id
        )
      ),
      md5('')
    ) as revision,
    coalesce(
      sum(greatest(coalesce(c.unread_count, 0), 0)),
      0
    )::bigint as unread_count
  from public.crm_conversations c;
end;
$$;

revoke all on function public.get_crm_inbox_live_state() from public;
revoke all on function public.get_crm_inbox_live_state() from anon;
revoke all on function public.get_crm_inbox_live_state() from authenticated;
grant execute on function public.get_crm_inbox_live_state() to authenticated;

notify pgrst, 'reload schema';

commit;

