-- Keep Instagram contact matching fast when resolving the stable Meta scoped ID.
-- This is intentionally index-only: no historical contact or message data changes.

begin;

create index if not exists idx_crm_contact_identities_instagram_identity_value
  on public.crm_contact_identities(identity_value)
  where identity_type = 'instagram';

commit;
