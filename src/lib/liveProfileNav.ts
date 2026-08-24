export function watchLiveProfilePath(roomId: string, userId: string): string | null {
  const room = roomId.trim();
  const uid = userId.trim();
  if (!room || !uid) return null;
  return `/watch/${encodeURIComponent(room)}/profile/${encodeURIComponent(uid)}`;
}

export function watchSessionPathFromOverlay(pathname: string, search = ""): string | null {
  const path = (pathname.split("?")[0] || "").trim();
  const match = path.match(/^\/watch\/([^/]+)\/profile\/[^/]+$/);
  if (!match?.[1]) return null;
  return `/watch/${match[1]}${search || ""}`;
}
