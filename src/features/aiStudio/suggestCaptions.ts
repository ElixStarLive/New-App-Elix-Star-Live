export type CaptionSuggestion = {
  caption: string;
  hashtags: string[];
  score: number;
};

const TRENDING = ["fyp", "foryou", "viral", "trending", "explore", "live", "creator"];

const CATEGORIES: Record<string, string[]> = {
  music: ["music", "song", "singer", "artist", "beats", "studio"],
  dance: ["dance", "dancer", "choreography", "moves"],
  comedy: ["comedy", "funny", "humor", "joke", "skit"],
  beauty: ["beauty", "makeup", "skincare", "glam", "tutorial"],
  fitness: ["fitness", "gym", "workout", "training"],
  food: ["food", "cooking", "recipe", "foodie"],
  travel: ["travel", "explore", "vacation", "trip"],
  fashion: ["fashion", "style", "outfit", "ootd"],
  gaming: ["gaming", "gamer", "gameplay", "streamer"],
  pets: ["pets", "dog", "cat", "puppy", "animals"],
  art: ["art", "artist", "drawing", "creative"],
  lifestyle: ["lifestyle", "life", "vlog", "routine"],
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/u)
    .map((w) => w.replace(/[^\p{L}\p{N}_]/gu, ""))
    .filter((w) => w.length > 2);
}

function pickTags(pool: string[], count: number, seed: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < pool.length && out.length < count; i++) {
    const idx = (seed + i * 7) % pool.length;
    const tag = pool[idx];
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

export function suggestCaptions(description: string): CaptionSuggestion[] {
  const words = tokenize(description);
  const hits: string[] = [];
  for (const [cat, tags] of Object.entries(CATEGORIES)) {
    if (words.some((w) => w === cat || tags.includes(w))) hits.push(cat);
  }
  if (hits.length === 0) hits.push("lifestyle");

  const suggestions: CaptionSuggestion[] = hits.slice(0, 2).map((cat, i) => {
    const catTags = CATEGORIES[cat] ?? [];
    const hashtags = [...new Set([...pickTags(catTags, 4, cat.length + i), ...pickTags(TRENDING, 3, cat.length)])].slice(0, 6);
    const overlap = words.filter((w) => catTags.includes(w) || w === cat).length;
    const score = Math.min(0.95, 0.62 + overlap * 0.08 + (description.trim() ? 0.1 : 0));
    return {
      caption: description.trim() ? `${description.trim()} · ${cat}` : `${cat} vibes`,
      hashtags,
      score,
    };
  });

  suggestions.push({
    caption: description.trim() || "Check this out",
    hashtags: pickTags(TRENDING, 5, description.length),
    score: description.trim() ? 0.72 : 0.55,
  });

  return suggestions.sort((a, b) => b.score - a.score);
}

export function suggestHashtags(description: string, limit = 10): string[] {
  const merged = suggestCaptions(description).flatMap((s) => s.hashtags);
  return [...new Set(merged)].slice(0, limit);
}
