alter table if exists public.modifier_group_options
add column if not exists marker_color text;

-- keep values clean but optional
alter table if exists public.modifier_group_options
  drop constraint if exists modifier_group_options_marker_color_check;

alter table if exists public.modifier_group_options
  add constraint modifier_group_options_marker_color_check
  check (
    marker_color is null
    or marker_color ~ '^#[0-9A-Fa-f]{6}$'
  );
