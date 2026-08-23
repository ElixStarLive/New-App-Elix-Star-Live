export const SEARCH_BROWSE_CATEGORIES = [
  "All",
  "For You",
  "Trending",
  "Dance",
  "Comedy",
  "Music",
  "Food",
  "Sports",
  "Fashion",
  "Gaming",
  "Travel",
  "Fitness",
  "Beauty",
  "Pets",
  "Art",
] as const;

export type SearchBrowseCategory = (typeof SEARCH_BROWSE_CATEGORIES)[number];

export function normalizeSearchCategory(raw: string | null | undefined): SearchBrowseCategory {
  const value = (raw || "").trim();
  return (SEARCH_BROWSE_CATEGORIES as readonly string[]).includes(value)
    ? (value as SearchBrowseCategory)
    : "All";
}

export function escapeIlike(q: string): string {
  return q.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}
