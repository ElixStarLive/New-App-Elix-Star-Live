const APP_SHARE = /\/(video|watch|live|profile)\/([a-zA-Z0-9_-]+)/i;
const URL_SPLIT = /(https?:\/\/[^\s]+)/gi;

export type ChatLinkPart =
  | { kind: "text"; text: string }
  | { kind: "url"; href: string }
  | { kind: "app"; path: string; label: string };

function appShare(url: string): { path: string; label: string } | null {
  const match = url.match(APP_SHARE);
  if (!match) return null;
  const kind = match[1].toLowerCase();
  const id = match[2];
  if (kind === "video") return { path: `/video/${id}`, label: "View Video" };
  if (kind === "profile") return { path: `/profile/${id}`, label: "View Profile" };
  return { path: `/watch/${id}`, label: "Join Live" };
}

function safeHttpUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function splitChatBody(text: string): ChatLinkPart[] {
  const parts: ChatLinkPart[] = [];
  const splitter = new RegExp(URL_SPLIT.source, "gi");
  let last = 0;
  let match: RegExpExecArray | null = splitter.exec(text);
  while (match) {
    if (match.index > last) {
      parts.push({ kind: "text", text: text.slice(last, match.index) });
    }
    const raw = match[0];
    const app = appShare(raw);
    const href = safeHttpUrl(raw);
    if (app) parts.push({ kind: "app", path: app.path, label: app.label });
    else if (href) parts.push({ kind: "url", href });
    else parts.push({ kind: "text", text: raw });
    last = match.index + raw.length;
    match = splitter.exec(text);
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts.length > 0 ? parts : [{ kind: "text", text }];
}
