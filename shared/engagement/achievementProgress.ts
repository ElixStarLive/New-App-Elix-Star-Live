/** Presentation-only bar width. Does not unlock or complete an achievement. */
export function achievementBarPercent(progress: unknown, goal: unknown): number {
  const rawProgress = typeof progress === "number" && Number.isFinite(progress) ? progress : 0;
  const safeProgress = Math.max(0, rawProgress);
  if (typeof goal !== "number" || !Number.isFinite(goal)) return 0;
  const safeGoal = goal > 0 ? goal : 1;
  return Math.min(100, (safeProgress / safeGoal) * 100);
}
