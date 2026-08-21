-- Receipt design settings

create table if not exists booking_receipt_design_settings (
  id uuid primary key default uuid_generate_v4(),
  logo_url text,
  brand_name text not null default 'Bounce Party LA',
  accent_color text not null default '#23313f',
  receipt_title text not null default 'Payment Receipt',
  footer_text text not null default 'Thank you for booking with us!',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on table booking_receipt_design_settings to anon, authenticated, service_role;

alter table booking_receipt_design_settings enable row level security;

do $$ begin
  create policy booking_receipt_design_settings_select_all
    on booking_receipt_design_settings
    for select
    to public
    using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy booking_receipt_design_settings_insert_all
    on booking_receipt_design_settings
    for insert
    to public
    with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy booking_receipt_design_settings_update_all
    on booking_receipt_design_settings
    for update
    to public
    using (true)
    with check (true);
exception when duplicate_object then null;
end $$;

insert into booking_receipt_design_settings (
  logo_url,
  brand_name,
  accent_color,
  receipt_title,
  footer_text
)
select
  null,
  'Bounce Party LA',
  '#23313f',
  'Payment Receipt',
  'Thank you for booking with us!'
where not exists (
  select 1 from booking_receipt_design_settings
);
