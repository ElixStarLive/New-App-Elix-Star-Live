import type { QueryResultRow } from "pg";
import type { FeedVideo } from "../../../shared/contracts/social.js";

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNonNeg(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function formatDurationMs(ms: unknown): string {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return "0:00";
  const totalSec = Math.floor(n / 1000);
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Maps VIDEO_SELECT / live-feed SQL rows to the frozen FeedVideo JSON contract.
 * Input columns are the canonical feed query shape only — no dual snake/camel fallbacks.
 */
export function formatFeedVideo(
  row: QueryResultRow,
  opts: {
    liked: boolean;
    saved: boolean;
    isFollowing: boolean;
    location: string;
  },
): FeedVideo {
  const userId = asText(row.user_id) || "unknown";
  const username = asText(row.username) || "user";
  const displayName = asText(row.display_name) || username;
  const avatar =
    asText(row.avatar_url) ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}`;

  const rawMusic =
    row.music && typeof row.music === "object" && !Array.isArray(row.music)
      ? (row.music as Record<string, unknown>)
      : null;
  let music: FeedVideo["music"] = null;
  if (rawMusic) {
    const previewUrl = typeof rawMusic.previewUrl === "string" ? rawMusic.previewUrl : undefined;
    music = {
      id: String(rawMusic.id ?? "original"),
      title: asText(rawMusic.title),
      artist: asText(rawMusic.artist, displayName),
      duration:
        typeof rawMusic.duration === "string"
          ? rawMusic.duration
          : formatDurationMs(typeof rawMusic.durationMs === "number" ? rawMusic.durationMs : 0),
      ...(previewUrl ? { previewUrl } : {}),
      ...(rawMusic.provider !== undefined ? { provider: rawMusic.provider } : {}),
      ...(typeof rawMusic.clipStartSeconds === "number"
        ? { clipStartSeconds: rawMusic.clipStartSeconds }
        : {}),
      ...(typeof rawMusic.clipEndSeconds === "number"
        ? { clipEndSeconds: rawMusic.clipEndSeconds }
        : {}),
    };
  }

  const duetWithVideoId =
    typeof row.duetWithVideoId === "string" && row.duetWithVideoId
      ? row.duetWithVideoId
      : undefined;
  const duetLayoutRaw = row.duetLayout;
  const duetLayout =
    duetLayoutRaw === "overlay" || duetLayoutRaw === "split" ? duetLayoutRaw : undefined;

  const createdRaw = row.created_at ?? null;
  const createdAt =
    createdRaw instanceof Date
      ? createdRaw.toISOString()
      : typeof createdRaw === "string"
        ? createdRaw
        : null;

  const hashtags = Array.isArray(row.hashtags)
    ? row.hashtags.filter((tag: unknown): tag is string => typeof tag === "string" && tag.length > 0)
    : [];

  return {
    id: String(row.id),
    url: asText(row.media_url),
    thumbnail: asText(row.thumbnail_url),
    duration: formatDurationMs(row.duration_ms),
    user: {
      id: userId,
      username,
      name: displayName,
      avatar,
      level: asNonNeg(row.level, 1) || 1,
      isVerified: Boolean(row.is_verified),
      followers: asNonNeg(row.followers),
      following: asNonNeg(row.following),
    },
    description: asText(row.caption),
    hashtags,
    music,
    stats: {
      views: asNonNeg(row.view_count),
      likes: asNonNeg(row.like_count),
      comments: asNonNeg(row.comment_count),
      shares: asNonNeg(row.shares_count),
      saves: asNonNeg(row.save_count),
    },
    createdAt,
    location: opts.location,
    isLiked: opts.liked,
    isSaved: opts.saved,
    isFollowing: opts.isFollowing,
    comments: [],
    quality: "auto",
    privacy: row.privacy === "private" ? "private" : "public",
    engagementScore: asNonNeg(row.engagement_score),
    ...(duetWithVideoId ? { duetWithVideoId: String(duetWithVideoId) } : {}),
    ...(duetLayout ? { duetLayout } : {}),
  };
}

export function forYouFeedEnvelope(
  videos: FeedVideo[],
  page: number,
  limit: number,
  offset: number,
  source: string,
): {
  videos: FeedVideo[];
  mutualUserIds: string[];
  page: number;
  limit: number;
  hasMore: boolean;
  total: number;
  source: string;
} {
  return {
    videos,
    mutualUserIds: [],
    page,
    limit,
    hasMore: videos.length >= limit,
    total: offset + videos.length,
    source,
  };
}
