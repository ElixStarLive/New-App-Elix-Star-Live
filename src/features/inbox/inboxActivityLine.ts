import type { InboxActivityItem } from "@shared/contracts";

export function inboxActivityActorName(item: InboxActivityItem): string {
  const display = item.actorDisplayName?.trim() || "";
  const username = item.actorUsername.trim();
  return display || username || "Someone";
}

export function inboxActivityLine(item: InboxActivityItem): string {
  if (item.kind === "like") return "Liked your video";
  if (item.kind === "save") return "Saved your video";
  if (item.kind === "mention") {
    const text = item.snippet?.trim() || "";
    if (text) {
      return text.length > 80 ? `Mentioned you: "${text.slice(0, 80)}…"` : `Mentioned you: "${text}"`;
    }
    return "Mentioned you in a comment";
  }
  const text = item.snippet?.trim() || "";
  if (text) {
    return text.length > 90 ? `Commented: "${text.slice(0, 90)}…"` : `Commented: "${text}"`;
  }
  return "Commented on your video";
}
