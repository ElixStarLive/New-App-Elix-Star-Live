export const QUALIFIED_WATCH_SECONDS = 3;
export const QUALIFIED_WATCH_MS = QUALIFIED_WATCH_SECONDS * 1000;

const SESSION_KEY = "foryou_viewed_v1";

function readViewed(): Set<string> {
  try {
    if (typeof sessionStorage === "undefined") return new Set();
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map(String));
  } catch {
    return new Set();
  }
}

export function hasQualifiedViewAttempt(videoId: string): boolean {
  return readViewed().has(videoId);
}

export function markQualifiedViewAttempt(videoId: string): void {
  const viewed = readViewed();
  if (viewed.has(videoId)) return;
  viewed.add(videoId);
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...viewed].slice(-500)));
  } catch {
    /* quota */
  }
}
