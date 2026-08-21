-- CRM Event Center: direct lead-linked tasks
alter table if exists public.tasks
  add column if not exists lead_id uuid references public.booking_leads(id) on delete cascade;

create index if not exists idx_tasks_lead_id
  on public.tasks(lead_id);
