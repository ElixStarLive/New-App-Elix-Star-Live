export function formatPence(pence: number): string {
  const n = Math.max(0, Math.floor(Number(pence) || 0));
  return `£${(n / 100).toFixed(2)}`;
}

export function poundsInputToPence(raw: string): number | null {
  const value = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const pounds = Number(value);
  if (!Number.isFinite(pounds)) return null;
  const pence = Math.round(pounds * 100);
  if (!Number.isSafeInteger(pence) || pence <= 0) return null;
  return pence;
}
