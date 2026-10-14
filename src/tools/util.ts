/** Floor `value` to an integer and clamp to [min, max]; non-numeric input yields `fallback`. */
export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}
