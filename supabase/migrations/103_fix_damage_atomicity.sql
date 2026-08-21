-- 103_fix_damage_atomicity.sql
-- Make general damage report creation atomic and idempotent.

begin;

alter table public.damage_reports
  add column idempotency_key uuid;

create unique index damage_reports_idempotency_key_uidx
  on public.damage_reports (idempotency_key)
  where idempotency_key is not null;

create or replace function public.process_inventory_damage(
  p_inventory_item_id uuid default null,
  p_inventory_unit_id uuid default null,
  p_booking_id uuid default null,
  p_idempotency_key uuid default null,
  p_title text default null,
  p_severity text default 'medium',
  p_repair_cost numeric default 0,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid := p_inventory_item_id;
  v_unit public.inventory_units%rowtype;
  v_report public.damage_reports%rowtype;
  v_now timestamptz := now();
begin
  if not public.current_user_can_manage_inventory() then
    raise exception 'Inventory management permission is required.';
  end if;

  if nullif(trim(p_title), '') is null then
    raise exception 'Damage title is required.';
  end if;

  if p_idempotency_key is null then
    raise exception 'Damage idempotency key is required.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_idempotency_key::text, 0)
  );

  select *
  into v_report
  from public.damage_reports
  where idempotency_key = p_idempotency_key;

  if v_report.id is not null then
    return jsonb_build_object(
      'status', 'already_processed',
      'report_id', v_report.id,
      'inventory_item_id', v_report.inventory_item_id,
      'inventory_unit_id', v_report.inventory_unit_id
    );
  end if;

  if p_inventory_unit_id is not null then
    select *
    into v_unit
    from public.inventory_units
    where id = p_inventory_unit_id
    for update;

    if v_unit.id is null then
      raise exception 'Inventory unit not found.';
    end if;

    if v_item_id is not null and v_item_id <> v_unit.inventory_item_id then
      raise exception 'Damage item does not match the inventory unit.';
    end if;

    v_item_id := v_unit.inventory_item_id;
  else
    null;
  end if;

  insert into public.damage_reports (
    inventory_item_id,
    inventory_unit_id,
    booking_id,
    title,
    severity,
    repair_cost,
    description,
    idempotency_key,
    status,
    updated_at
  )
  values (
    v_item_id,
    p_inventory_unit_id,
    p_booking_id,
    trim(p_title),
    coalesce(p_severity, 'medium'),
    coalesce(p_repair_cost, 0),
    p_description,
    p_idempotency_key,
    'open',
    v_now
  )
  returning * into v_report;

  if p_inventory_unit_id is not null then
    update public.inventory_units
    set
      status = 'damaged',
      condition = 'damaged',
      updated_at = v_now
    where id = p_inventory_unit_id;
  end if;

  return jsonb_build_object(
    'status', 'processed',
    'report_id', v_report.id,
    'inventory_item_id', v_report.inventory_item_id,
    'inventory_unit_id', v_report.inventory_unit_id
  );
end;
$$;

revoke all on function public.process_inventory_damage(
  uuid, uuid, uuid, uuid, text, text, numeric, text
) from public, anon;

grant execute on function public.process_inventory_damage(
  uuid, uuid, uuid, uuid, text, text, numeric, text
) to authenticated;

commit;

notify pgrst, 'reload schema';
