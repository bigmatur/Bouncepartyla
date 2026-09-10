-- =========================================================
-- 109 Unify category source via inventory_categories
-- =========================================================

-- Inventory categories become the canonical editing surface.
-- The legacy categories table is kept as a synced compatibility table
-- for existing reads/joins.

alter table if exists public.inventory_categories
  add column if not exists description text,
  add column if not exists parent_id uuid references public.inventory_categories(id) on delete set null,
  add column if not exists active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists customer_visible boolean not null default true;

alter table if exists public.categories
  add column if not exists customer_visible boolean not null default true;

update public.inventory_categories
set customer_visible = true
where customer_visible is null;

update public.categories
set customer_visible = true
where customer_visible is null;

create index if not exists idx_inventory_categories_parent_id
  on public.inventory_categories(parent_id);

create index if not exists idx_inventory_categories_active_customer_visible
  on public.inventory_categories(active, customer_visible);

-- Backfill inventory categories from legacy categories when there is no matching
-- inventory row by id, slug, or normalized name.
insert into public.inventory_categories (
  id,
  name,
  slug,
  description,
  parent_id,
  sort_order,
  active,
  customer_visible,
  created_at,
  updated_at
)
select
  c.id,
  c.name,
  coalesce(nullif(c.slug, ''), 'category-' || substring(c.id::text, 1, 8)),
  c.description,
  c.parent_id,
  coalesce(c.sort_order, 100),
  coalesce(c.active, true),
  coalesce(c.customer_visible, true),
  coalesce(c.created_at, now()),
  coalesce(c.updated_at, now())
from public.categories c
where not exists (
  select 1
  from public.inventory_categories ic
  where ic.id = c.id
     or (c.slug is not null and ic.slug = c.slug)
     or lower(trim(coalesce(ic.name, ''))) = lower(trim(coalesce(c.name, '')))
);

-- products.category_id may still reference public.categories(id),
-- so sync categories first to avoid FK violations during remap.
insert into public.categories (
  id,
  name,
  slug,
  description,
  parent_id,
  sort_order,
  active,
  customer_visible,
  created_at,
  updated_at
)
select
  ic.id,
  ic.name,
  case
    when exists (
      select 1
      from public.categories c_slug
      where c_slug.slug = ic.slug
        and c_slug.id <> ic.id
    )
      then ic.slug || '-' || substring(ic.id::text, 1, 8)
    else ic.slug
  end,
  ic.description,
  ic.parent_id,
  coalesce(ic.sort_order, 100),
  coalesce(ic.active, true),
  coalesce(ic.customer_visible, true),
  coalesce(ic.created_at, now()),
  coalesce(ic.updated_at, now())
from public.inventory_categories ic
on conflict (id) do update
set
  name = excluded.name,
  slug = case
    when exists (
      select 1
      from public.categories c_slug
      where c_slug.slug = excluded.slug
        and c_slug.id <> public.categories.id
    )
      then excluded.slug || '-' || substring(excluded.id::text, 1, 8)
    else excluded.slug
  end,
  description = excluded.description,
  parent_id = excluded.parent_id,
  sort_order = excluded.sort_order,
  active = excluded.active,
  customer_visible = excluded.customer_visible,
  updated_at = now();

-- Re-point products to inventory category ids (match by current id, then slug, then name).
update public.products p
set category_id = mapping.inventory_id
from (
  select
    p2.id as product_id,
    coalesce(
      ic_direct.id,
      ic_slug.id,
      ic_name.id
    ) as inventory_id
  from public.products p2
  left join public.inventory_categories ic_direct
    on ic_direct.id = p2.category_id
  left join public.categories c
    on c.id = p2.category_id
  left join public.inventory_categories ic_slug
    on c.slug is not null
   and ic_slug.slug = c.slug
  left join public.inventory_categories ic_name
    on lower(trim(coalesce(ic_name.name, ''))) = lower(trim(coalesce(c.name, '')))
) as mapping
where p.id = mapping.product_id
  and mapping.inventory_id is not null
  and p.category_id is distinct from mapping.inventory_id;

-- Keep categories table in sync with canonical inventory categories for compatibility.
insert into public.categories (
  id,
  name,
  slug,
  description,
  parent_id,
  sort_order,
  active,
  customer_visible,
  created_at,
  updated_at
)
select
  ic.id,
  ic.name,
  case
    when exists (
      select 1
      from public.categories c_slug
      where c_slug.slug = ic.slug
        and c_slug.id <> ic.id
    )
      then ic.slug || '-' || substring(ic.id::text, 1, 8)
    else ic.slug
  end,
  ic.description,
  ic.parent_id,
  coalesce(ic.sort_order, 100),
  coalesce(ic.active, true),
  coalesce(ic.customer_visible, true),
  coalesce(ic.created_at, now()),
  coalesce(ic.updated_at, now())
from public.inventory_categories ic
on conflict (id) do update
set
  name = excluded.name,
  slug = case
    when exists (
      select 1
      from public.categories c_slug
      where c_slug.slug = excluded.slug
        and c_slug.id <> public.categories.id
    )
      then excluded.slug || '-' || substring(excluded.id::text, 1, 8)
    else excluded.slug
  end,
  description = excluded.description,
  parent_id = excluded.parent_id,
  sort_order = excluded.sort_order,
  active = excluded.active,
  customer_visible = excluded.customer_visible,
  updated_at = now();

create or replace function public.sync_category_from_inventory_category()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Keep slugs unique in categories even when multiple category sources
  -- contain the same slug for different ids.
  insert into public.categories (
    id,
    name,
    slug,
    description,
    parent_id,
    sort_order,
    active,
    customer_visible,
    created_at,
    updated_at
  ) values (
    new.id,
    new.name,
    case
      when exists (
        select 1
        from public.categories c_slug
        where c_slug.slug = new.slug
          and c_slug.id <> new.id
      )
        then new.slug || '-' || substring(new.id::text, 1, 8)
      else new.slug
    end,
    new.description,
    new.parent_id,
    coalesce(new.sort_order, 100),
    coalesce(new.active, true),
    coalesce(new.customer_visible, true),
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, now())
  )
  on conflict (id) do update
  set
    name = excluded.name,
    slug = case
      when exists (
        select 1
        from public.categories c_slug
        where c_slug.slug = excluded.slug
          and c_slug.id <> public.categories.id
      )
        then excluded.slug || '-' || substring(excluded.id::text, 1, 8)
      else excluded.slug
    end,
    description = excluded.description,
    parent_id = excluded.parent_id,
    sort_order = excluded.sort_order,
    active = excluded.active,
    customer_visible = excluded.customer_visible,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.delete_category_from_inventory_category()
returns trigger
language plpgsql
security definer
as $$
begin
  delete from public.categories where id = old.id;
  return old;
end;
$$;

drop trigger if exists sync_category_from_inventory_category_write
  on public.inventory_categories;
create trigger sync_category_from_inventory_category_write
after insert or update on public.inventory_categories
for each row execute function public.sync_category_from_inventory_category();

drop trigger if exists sync_category_from_inventory_category_delete
  on public.inventory_categories;
create trigger sync_category_from_inventory_category_delete
after delete on public.inventory_categories
for each row execute function public.delete_category_from_inventory_category();
