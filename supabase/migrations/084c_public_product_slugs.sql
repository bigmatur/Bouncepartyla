-- 084C — Stable public product slugs
--
-- IMPORTANT:
-- We intentionally do NOT rename products.slug.
-- Existing internal customer/catalog links can keep using the old slug.
-- public_slug is reserved for website / marketing / external deep links.

alter table public.products
  add column if not exists public_slug text;

create unique index if not exists products_public_slug_unique_idx
  on public.products (lower(public_slug))
  where public_slug is not null
    and trim(public_slug) <> '';

comment on column public.products.public_slug is
  'Stable customer-facing slug used by public booking/product URLs. Internal products.slug remains backward-compatible.';

-- Bounce house
update public.products
set public_slug = 'bounce-cake'
where name = 'Bounce Cake';

update public.products
set public_slug = 'sugar-candies'
where name = 'Sugar candies';

update public.products
set public_slug = 'white-castle'
where name = 'The white castle';

update public.products
set public_slug = 'blue-castle'
where name = 'The blue castle';

update public.products
set public_slug = 'pink-castle'
where name = 'The pink castle';

update public.products
set public_slug = 'new-white-castle'
where name = 'New White Castle';

-- Bounce & Slide Combo
update public.products
set public_slug = 'white-castle-3-in-1'
where name = 'White castle 3 in 1';

update public.products
set public_slug = 'white-castle-slide-ball-pit'
where name = 'White castle with a slide and a ball pit';

update public.products
set public_slug = 'princess-castle-with-slide'
where name = 'Princess Castle with Slide';

update public.products
set public_slug = 'dream-slide-castle'
where name = 'Dream Slide Castle';

update public.products
set public_slug = 'bounce-party'
where name = 'Bounce Party';

update public.products
set public_slug = 'new-princess-castle-with-slide'
where name = 'New Princess Castle with Slide';

update public.products
set public_slug = 'santa-barbara-palace'
where name = 'Santa Barbara Palace';

update public.products
set public_slug = 'royal-castle'
where name = 'The Royal Castle';

update public.products
set public_slug = 'casa-blanca'
where name = 'Casa Blanca';

update public.products
set public_slug = 'palace-of-agrabah'
where name = 'The magnificent palace of Agrabah';

update public.products
set public_slug = 'chateau-blanc'
where name = 'Château Blanc';

-- Bubble House
update public.products
set public_slug = 'bubble-bounce-house'
where name = 'Bubble Bounce House';

update public.products
set public_slug = 'bubble-house'
where name = 'Bubble House';

-- Mini bounce houses
update public.products
set public_slug = 'mini-jumper-slide-small-ball-pit'
where name = 'Mini jumper with Slide and Small Ball Pit';

update public.products
set public_slug = 'skippy'
where name = 'Skippy';

update public.products
set public_slug = 'mini-jumper-slide-big-ball-pit'
where name = 'Mini jumper with Slide and Big Ball Pit';

-- Soft Play
update public.products
set public_slug = 'soft-play-ball-pit'
where name = 'Soft play+ball pit';

update public.products
set public_slug = 'soft-play-mini-bounce-house'
where name = 'Soft play+mini bounce house';

update public.products
set public_slug = 'new-soft-play-ball-pit'
where name = 'New soft play+ball pit';

update public.products
set public_slug = 'new-soft-play-mini-bounce-house-ball-pit'
where name = 'New Soft Play + Mini Bounce House with Ball Pit';

update public.products
set public_slug = 'new-soft-play-mini-jumper-slide-small-ball-pit'
where name = 'New Soft play+Mini jumper with Slide small ball pit';

-- Packages
update public.products
set public_slug = 'new-white-castle-half-soft-play'
where name = 'New White Castle + Half Soft Play';

update public.products
set public_slug = 'white-castle-3-in-1-half-soft-play'
where name = 'White castle 3 in 1 _Half Soft Play';

update public.products
set public_slug = 'bounce-party-half-soft-play'
where name = 'Bounce Party + Half Soft Play';

update public.products
set public_slug = 'dream-slide-castle-half-soft-play'
where name = 'Dream Slide Castle +Half Soft Play';

update public.products
set public_slug = 'santa-barbara-palace-half-soft-play'
where name = 'Santa Barbara Palace+ Half Soft Play';

update public.products
set public_slug = 'white-castle-slide-ball-pit-half-soft-play'
where name = 'White castle with a slide and a ball pit Half Soft Play';

-- Safety verification.
-- This SELECT should return 0 rows after the migration if all active
-- customer-facing products have a public_slug.
select
  id,
  name,
  slug,
  public_slug
from public.products
where coalesce(active, true) = true
  and (
    public_slug is null
    or trim(public_slug) = ''
  )
order by sort_order, name;
