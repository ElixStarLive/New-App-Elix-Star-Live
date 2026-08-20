export function extractHashtags(caption: string): string[] {
  const matches = caption.match(/#[A-Za-z0-9_]+/g) ?? [];
  return [...new Set(matches.map((tag) => tag.slice(1).toLowerCase()))];
}

export function normalizeHashtag(raw: string): string {
  return raw.trim().replace(/^#/, "").toLowerCase();
}
