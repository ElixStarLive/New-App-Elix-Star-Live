export function utcDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function utcWeekKey(date = new Date()): string {
  const cursor = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = cursor.getUTCDay() || 7;
  cursor.setUTCDate(cursor.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(cursor.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((cursor.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${cursor.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function missionPeriodKey(scope: string, date = new Date()): string {
  return scope === "weekly" ? utcWeekKey(date) : utcDateKey(date);
}
