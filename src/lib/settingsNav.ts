export const SETTINGS_HOME = "/settings";
export const SETTINGS_EXIT_TO = "/profile";
export const ENGAGEMENT_HOME = "/engagement";
export const PROFILE_EXIT_TO = "/feed";
export const FEED_HOME = "/feed";
export const EDIT_PROFILE_EXIT_TO = SETTINGS_HOME;
export const DISCOVER_HOME = "/discover";
export const SEARCH_EXIT_TO = FEED_HOME;
export const SHOP_EXIT_TO = FEED_HOME;
export const VIDEO_EXIT_TO = FEED_HOME;
export const RISING_STARS_EXIT_TO = FEED_HOME;
export const RISING_STARS_HOME = "/rising-stars";
export const AI_STUDIO_EXIT_TO = FEED_HOME;
export const FOLLOW_LIST_EXIT_TO = SETTINGS_EXIT_TO;
export const SAVED_HOME = "/saved";
export const INBOX_HOME = "/inbox";

function hasUnsafePathCharacters(path: string): boolean {
  return Array.from(path).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 || character === "\\";
  });
}

export function returnToFromLocationState(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const raw = (state as { returnTo?: unknown }).returnTo;
  if (typeof raw !== "string") return null;
  const path = raw.trim().split("#")[0] || "";
  if (!path.startsWith("/") || path.startsWith("//") || hasUnsafePathCharacters(path)) {
    return null;
  }
  return path;
}

export function containerReturnState(path: string): { returnTo: string } {
  const trimmed = path.trim().split("#")[0] || "";
  const safe =
    trimmed.startsWith("/") && !trimmed.startsWith("//") && !hasUnsafePathCharacters(trimmed)
      ? trimmed
      : FEED_HOME;
  return { returnTo: safe };
}

export function liveReturnState(pathname: string, search = ""): { returnTo: string } {
  const match = pathname.match(/^\/watch\/([^/]+)/);
  const watchPath = match?.[1] ? `/watch/${match[1]}${search}` : FEED_HOME;
  return containerReturnState(watchPath);
}

export function inboxReturnState(): { returnTo: typeof INBOX_HOME } {
  return containerReturnState(INBOX_HOME) as { returnTo: typeof INBOX_HOME };
}

export function exitToFromLocationState(state: unknown, fallback: string): string {
  return returnToFromLocationState(state) || fallback;
}

function namedExitForPath(pathname: string): string {
  const path = pathname.split("?")[0] || "/";
  if (
    path === "/" ||
    path === "/feed" ||
    path === "/friends" ||
    path === "/inbox" ||
    path === "/profile" ||
    path === "/login"
  ) {
    return path;
  }
  if (path === SETTINGS_HOME || path.startsWith(`${SETTINGS_HOME}/`)) {
    if (path === SETTINGS_HOME) return SETTINGS_EXIT_TO;
    return SETTINGS_HOME;
  }
  if (path === ENGAGEMENT_HOME || path.startsWith(`${ENGAGEMENT_HOME}/`)) {
    if (path === ENGAGEMENT_HOME) return SETTINGS_HOME;
    return ENGAGEMENT_HOME;
  }
  const followListMatch = path.match(/^\/profile\/([^/]+)\/(followers|following)$/);
  if (followListMatch) return `/profile/${followListMatch[1]}`;
  if (path.startsWith("/profile/") || path === "/edit-profile") return PROFILE_EXIT_TO;
  if (/^\/watch\/[^/]+\/profile/.test(path)) {
    const streamId = path.match(/^\/watch\/([^/]+)/)?.[1];
    return streamId ? `/watch/${streamId}` : VIDEO_EXIT_TO;
  }
  if (path === SAVED_HOME || path.startsWith(`${SAVED_HOME}/`)) return SETTINGS_HOME;
  if (path.startsWith("/shop")) return SHOP_EXIT_TO;
  if (path.startsWith("/video/") || path.startsWith("/watch/")) return VIDEO_EXIT_TO;
  if (path.startsWith("/rising-stars")) {
    if (path === RISING_STARS_HOME) return RISING_STARS_EXIT_TO;
    return RISING_STARS_HOME;
  }
  if (path.startsWith("/ai-studio")) return AI_STUDIO_EXIT_TO;
  if (path.startsWith("/search")) return SEARCH_EXIT_TO;
  if (path.startsWith("/discover")) return FEED_HOME;
  if (path.startsWith("/hashtag/")) return DISCOVER_HOME;
  if (path.startsWith("/inbox/") || path.startsWith("/chat/") || path === "/alerts") return INBOX_HOME;
  if (path.startsWith("/live/") || path.startsWith("/go-live")) return FEED_HOME;
  if (path.startsWith("/create") || path.startsWith("/upload")) return FEED_HOME;
  if (
    path === "/support" ||
    path === "/how-it-works" ||
    path === "/terms" ||
    path === "/privacy" ||
    path === "/guidelines" ||
    path === "/copyright"
  ) {
    return SETTINGS_HOME;
  }
  return FEED_HOME;
}

export function namedExitForLocation(pathname: string, state?: unknown): string {
  const returnTo = returnToFromLocationState(state);
  if (returnTo) return returnTo;
  return namedExitForPath(pathname);
}

/** Null means this surface is a named root — stay. Never use history.back(). */
export function namedHardwareBackTarget(pathname: string, state?: unknown): string | null {
  const path = pathname.split("?")[0] || "/";
  const exit = namedExitForLocation(path, state);
  return exit === path ? null : exit;
}
