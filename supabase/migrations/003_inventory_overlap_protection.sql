create extension if not exists btree_gist;

alter table inventory_reservations
drop constraint if exists no_overlapping_unit_reservations;

alter table inventory_reservations
add constraint no_overlapping_unit_reservations
exclude using gist (
  inventory_unit_id with =,
  tstzrange(reserved_from, reserved_until, '[)') with &&
)
where (
  inventory_unit_id is not null
  and status in ('reserved', 'picked', 'loaded', 'delivered', 'installed')
);
