import type { FeedItem } from "@shared/contracts";

const SUGGESTIVE = [
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
];

const EXTRA = [
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
];

export function isStemExtraCaption(description: string, hashtags: string[] = []): boolean {
  const text = `${description || ""} ${(hashtags || []).join(" ")}`.toLowerCase();
  return SUGGESTIVE.some((word) => text.includes(word)) || EXTRA.some((word) => text.includes(word));
}

/** OLD STEM: top 40 by views, then up to 20 extra caption matches, cap 55. */
export function rankStemItems(items: FeedItem[]): FeedItem[] {
  const eligible = items.filter((item) => item.kind !== "live" && Boolean((item.mediaUrl || "").trim()));
  const byViews = [...eligible].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
  const topTrending = byViews.slice(0, 40);
  const seen = new Set(topTrending.map((item) => item.id));
  const extraPool = byViews.filter(
    (item) => !seen.has(item.id) && isStemExtraCaption(item.caption || "", item.hashtags ?? []),
  );
  return [...topTrending, ...extraPool.slice(0, 20)].slice(0, 55);
}
