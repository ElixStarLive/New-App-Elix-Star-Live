import type { QueryResultRow } from "pg";
import type { FeedVideo } from "../../../shared/contracts/social.js";

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNonNeg(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function formatDurationSeconds(sec: unknown): string {
  const n = Number(sec);
  if (!Number.isFinite(n) || n < 0) return "0:00";
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * NEW formatter for the frozen OLD production feed video row.
 * Same field names and nesting as live OLD `formatVideoForClient` — independently written.
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
  const nested = row.user && typeof row.user === "object" && !Array.isArray(row.user)
    ? (row.user as Record<string, unknown>)
    : null;
  const userId =
    asText(nested?.user_id) ||
    asText(nested?.id) ||
    asText(row.user_id) ||
    "unknown";
  const username = asText(nested?.username) || asText(row.username) || "user";
  const displayName = asText(nested?.display_name) || asText(row.display_name) || username;
  const avatar =
    asText(nested?.avatar_url) ||
    asText(row.avatar_url) ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}`;

  const rawMusic =
    row.music && typeof row.music === "object" && !Array.isArray(row.music)
      ? (row.music as Record<string, unknown>)
      : null;
  let music: FeedVideo["music"] = null;
  if (rawMusic) {
    const previewUrl =
      typeof rawMusic.previewUrl === "string"
        ? rawMusic.previewUrl
        : typeof rawMusic.url === "string"
          ? rawMusic.url
          : undefined;
    music = {
      id: String(rawMusic.id ?? "original"),
      title: asText(rawMusic.title),
      artist: asText(rawMusic.artist, displayName),
      duration:
        typeof rawMusic.duration === "string"
          ? rawMusic.duration
          : formatDurationSeconds(rawMusic.duration),
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
    (typeof row.duetWithVideoId === "string" && row.duetWithVideoId) ||
    (typeof rawMusic?.duetWithVideoId === "string" && rawMusic.duetWithVideoId) ||
    undefined;
  const duetLayoutRaw = row.duetLayout || rawMusic?.duetLayout || null;
  const duetLayout =
    duetLayoutRaw === "overlay" || duetLayoutRaw === "split" ? duetLayoutRaw : undefined;

  const createdRaw = row.created_at ?? row.createdAt ?? null;
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
    url: asText(row.url) || asText(row.video_url) || asText(row.media_url) || asText(row.bunny_path),
    thumbnail:
      asText(row.thumbnail) || asText(row.thumbnail_url) || asText(row.thumb_url),
    duration: formatDurationSeconds(row.duration_seconds ?? row.duration),
    user: {
      id: userId,
      username,
      name: displayName,
      avatar,
      level: asNonNeg(nested?.level ?? row.level, 1) || 1,
      isVerified: Boolean(nested?.is_creator ?? nested?.isVerified ?? row.is_verified),
      followers: asNonNeg(nested?.followers ?? row.followers),
      following: asNonNeg(nested?.following ?? row.following),
    },
    description: asText(row.description) || asText(row.caption),
    hashtags,
    music,
    stats: {
      views: asNonNeg(row.views ?? row.view_count),
      likes: asNonNeg(row.likes ?? row.likes_count ?? row.like_count),
      comments: asNonNeg(row.comments ?? row.comments_count ?? row.comment_count),
      shares: asNonNeg(row.shares ?? row.shares_count),
      saves: asNonNeg(row.saves ?? row.save_count),
    },
    createdAt,
    location: opts.location,
    isLiked: opts.liked,
    isSaved: opts.saved,
    isFollowing: opts.isFollowing,
    comments: [],
    quality: "auto",
    privacy:
      row.privacy === "private" || row.is_public === false ? "private" : "public",
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
