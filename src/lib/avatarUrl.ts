/**
 * Canonical avatar URL for every circle in the app.
 * Real photo URLs only — never yellow /royce/default-avatar.svg.
 */

export function realAvatarUrl(...candidates: Array<string | null | undefined>): string {
  for (const raw of candidates) {
    const url = typeof raw === "string" ? raw.trim() : "";
    if (!url) continue;
    const lower = url.toLowerCase();
    if (lower.includes("default-avatar")) continue;
    if (lower.includes("ui-avatars.com")) continue;
    return url;
  }
  return "";
}
