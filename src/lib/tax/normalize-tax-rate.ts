export function normalizeTaxRatePercent(rawRate: unknown) {
  const parsed = Number(rawRate);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  // Accept both storage formats:
  // - percent: 10.25
  // - fraction: 0.1025
  if (parsed <= 1) {
    return Number((parsed * 100).toFixed(6));
  }

  // Guard for accidental basis points / whole-number percent noise.
  if (parsed > 100) {
    return Number((parsed / 100).toFixed(6));
  }

  return Number(parsed.toFixed(6));
}
