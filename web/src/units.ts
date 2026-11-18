export function fmtLength(m: number): string {
  if (!Number.isFinite(m)) return "-";
  if (m < 1) return `${Math.round(m * 1000)} mm`;
  return `${m.toFixed(m < 10 ? 2 : 1)} m`;
}
