-- =========================================================
-- 112 Allow customers to read visible inventory categories
-- =========================================================
--
-- inventory_categories remains staff-managed.
-- Authenticated users may only SELECT categories that are
-- active and explicitly visible in the customer catalog.

drop policy if exists inventory_categories_select_customer_visible
on public.inventory_categories;

create policy inventory_categories_select_customer_visible
on public.inventory_categories
for select
to authenticated
using (
  active = true
  and customer_visible = true
);
