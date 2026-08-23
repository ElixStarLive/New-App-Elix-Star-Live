/** Strip one leading #, trim, lowercase. `car` is not `carpet`. */
export function normalizeHashtag(raw: string): string {
  return raw.trim().replace(/^#/, "").toLowerCase();
}

const HASHTAG_TOKEN = /#([\p{L}\p{N}_]+)/gu;
export const MAX_HASHTAGS = 20;

function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const normalized = normalizeHashtag(tag);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= MAX_HASHTAGS) break;
  }
  return out;
}

/** Caption tokens like `#car` — `#carpet` stays one tag. */
export function extractHashtags(caption: string): string[] {
  const found: string[] = [];
  for (const match of caption.matchAll(HASHTAG_TOKEN)) {
    if (match[1]) found.push(match[1]);
  }
  return uniqueTags(found);
}

/** Manual field: space/comma separated, with or without `#`. */
export function parseHashtagField(text: string): string[] {
  return uniqueTags(
    text
      .split(/[\s,]+/)
      .map((part) => part.trim())
      .filter(Boolean),
  );
}

export function mergeHashtags(caption: string, extraField = ""): string[] {
  return uniqueTags([...extractHashtags(caption), ...parseHashtagField(extraField)]);
}
