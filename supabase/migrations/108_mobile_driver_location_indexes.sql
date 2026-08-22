-- 108_mobile_driver_location_indexes.sql
-- Keep live driver lookups fast without assuming a fresh environment already
-- contains the legacy driver_location_pings table.

begin;

do $block$
begin
  if to_regclass('public.driver_location_pings') is not null then
    execute '
      create index if not exists driver_location_pings_driver_created_idx
      on public.driver_location_pings (driver_name, created_at desc)
    ';

    execute '
      create index if not exists driver_location_pings_route_created_idx
      on public.driver_location_pings (route_date, created_at desc)
    ';
  end if;
end;
$block$;

commit;
