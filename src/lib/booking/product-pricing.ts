export function getProductUnitPrice(product: {
  base_price?: unknown;
  price?: unknown;
}) {
  const raw = product.base_price ?? product.price ?? 0;
  const parsed = Number(raw);

  return Number.isNaN(parsed) ? 0 : parsed;
}
