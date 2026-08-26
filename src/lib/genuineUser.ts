import { realAvatarUrl } from "@/lib/avatarUrl";

/**
 * Story / suggestion circles — only real production accounts.
 * Written for NEW against OLD allowlist behaviour (not a paste of OLD source).
 */

function compactLabel(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s.-]+/g, "");
}

const ALLOWED_COMPACT = new Set([
  "elixstarlive",
  "anyaemily",
  "admin",
  "adminaccount",
  "admn",
  "admnaccount",
  "daniel",
  "crd",
  "crdstar",
  "sandramonica",
  "sandamonica",
  "andreiionutberica",
  "andreiionut",
  "andreiberica",
]);

function isAllowedLabel(part: string): boolean {
  const compact = compactLabel(part);
  if (!compact) return false;
  if (ALLOWED_COMPACT.has(compact)) return true;
  if (compact.includes("andrei") && compact.includes("berica")) return true;
  if (compact.includes("andrei") && compact.includes("ionut")) return true;
  return false;
}

/** True only for owner-allowlisted accounts — excludes proof/test usernames. */
export function isGenuineAppUser(username: string, userId = "", displayName = ""): boolean {
  const id = String(userId || "").trim();
  if (!id) return false;

  const handle = String(username || "").trim();
  const display = String(displayName || "").trim();
  if (!handle && !display) return false;

  if (handle && isAllowedLabel(handle)) return true;
  if (display && isAllowedLabel(display)) return true;
  return false;
}

/** @deprecated Prefer realAvatarUrl — kept as the story-circle alias. */
export const storyCirclePhotoUrl = realAvatarUrl;
