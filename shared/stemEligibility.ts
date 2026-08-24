export const STEM_TOP_TRENDING = 40;
export const STEM_EXTRA_SLOTS = 20;
export const STEM_MAX = 55;

/** OLD STEM extra slots — not science/technology keywords. */
export const STEM_SUGGESTIVE_KEYWORDS = [
  "bikini",
  "bikiny",
  "swimwear",
  "swimsuit",
  "beach",
  "pool",
  "poolside",
  "lingerie",
  "two piece",
  "2 piece",
] as const;

export const STEM_INDECENTISH_KEYWORDS = [
  "nsfw",
  "sexy",
  "nude",
  "nudity",
  "onlyfans",
  "porn",
  "xxx",
  "hot",
  "thirst",
  "spicy",
  "18+",
  "adult",
  "explicit",
] as const;

export type StemRankable = {
  id: string;
  kind?: string;
  mediaUrl?: string | null;
  viewCount?: number;
  caption?: string;
  hashtags?: string[];
};

export function stemCaptionHaystack(description: string, hashtags: string[] = []): string {
  return `${description || ""} ${(hashtags || []).join(" ")}`.toLowerCase();
}

export function isStemExtraCaption(description: string, hashtags: string[] = []): boolean {
  const text = stemCaptionHaystack(description, hashtags);
  return (
    STEM_SUGGESTIVE_KEYWORDS.some((word) => text.includes(word)) ||
    STEM_INDECENTISH_KEYWORDS.some((word) => text.includes(word))
  );
}

/** OLD Discover Trending: indecent-style caption/hashtags only (not STEM extras / not all trending). */
export function isIndecentExploreCaption(description: string, hashtags: string[] = []): boolean {
  const text = stemCaptionHaystack(description, hashtags);
  return STEM_INDECENTISH_KEYWORDS.some((word) => text.includes(word));
}

export function exploreIndecentLikePatterns(): string[] {
  return STEM_INDECENTISH_KEYWORDS.map((word) => `%${word.toLowerCase()}%`);
}

export function stemExtraLikePatterns(): string[] {
  return [...STEM_SUGGESTIVE_KEYWORDS, ...STEM_INDECENTISH_KEYWORDS].map((word) => `%${word.toLowerCase()}%`);
}

/** OLD STEM: top 40 by views, then up to 20 extra caption matches, cap 55. */
export function rankStemItems<T extends StemRankable>(items: T[]): T[] {
  const eligible = items.filter((item) => item.kind !== "live" && Boolean((item.mediaUrl || "").trim()));
  const byViews = [...eligible].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
  const topTrending = byViews.slice(0, STEM_TOP_TRENDING);
  const seen = new Set(topTrending.map((item) => item.id));
  const extraPool = byViews.filter(
    (item) => !seen.has(item.id) && isStemExtraCaption(item.caption || "", item.hashtags ?? []),
  );
  return [...topTrending, ...extraPool.slice(0, STEM_EXTRA_SLOTS)].slice(0, STEM_MAX);
}
