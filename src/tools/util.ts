/** Floor `value` to an integer and clamp to [min, max]; non-numeric input yields `fallback`. */
export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

/** Coarse duration in its largest whole unit: `90` → `1m`, `0` → `0s`. */
export function span(secs: number): string {
  const units: [string, number][] = [["d", 86400], ["h", 3600], ["m", 60], ["s", 1]];
  for (const [u, n] of units) {
    if (secs >= n) {
      return `${Math.floor(secs / n)}${u}`;
    }
  }
  return "0s";
}
