export function inboxMessagePreview(raw: string | undefined | null): string {
  const text = String(raw || "").trim();
  if (!text) return "No messages yet";
  if (/\/(watch|live)\//i.test(text)) return "Shared a live";
  if (/\/video\//i.test(text)) return "Shared a video";
  if (/\/profile\//i.test(text)) return "Shared a profile";
  return text;
}

export function inboxTimeAgo(dateStr: string): string {
  const at = Date.parse(dateStr);
  if (!Number.isFinite(at)) return "";
  const diff = Date.now() - at;
  if (diff < 0) return "";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}
