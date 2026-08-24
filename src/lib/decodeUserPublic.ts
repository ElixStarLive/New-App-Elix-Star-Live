import { userPublicSchema, type UserPublic } from "@shared/contracts";
import { isRecord } from "@/lib/isRecord";

function readString(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string") return value;
  }
  return null;
}

function readBool(obj: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function readCount(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
    if (typeof value === "string" && value.trim()) {
      const n = Number(value);
      if (Number.isFinite(n)) return Math.max(0, Math.trunc(n));
    }
  }
  return undefined;
}

export function decodeUserPublicFromPayload(payload: unknown): UserPublic | null {
  const node =
    isRecord(payload) && isRecord(payload.user)
      ? payload.user
      : isRecord(payload) && isRecord(payload.profile)
        ? payload.profile
        : isRecord(payload)
          ? payload
          : null;
  if (!node) return null;

  const id = readString(node, "id", "user_id", "userId")?.trim() ?? "";
  const username = readString(node, "username") ?? "";
  const displayName = readString(node, "displayName", "display_name") ?? username;
  const avatarRaw = readString(node, "avatarUrl", "avatar_url", "avatar");
  const bio = readString(node, "bio") ?? "";

  const candidate = {
    id,
    username,
    displayName,
    avatarUrl: avatarRaw ?? null,
    bio,
    isVerified: readBool(node, "isVerified", "is_verified") ?? false,
    followerCount: readCount(node, "followerCount", "followers", "followers_count") ?? 0,
    followingCount: readCount(node, "followingCount", "following", "following_count") ?? 0,
    likeCount: readCount(node, "likeCount", "likes", "likes_count"),
    viewCount: readCount(node, "viewCount", "views", "views_count"),
    isLive: readBool(node, "isLive", "is_live"),
    isFollowing: readBool(node, "isFollowing", "is_following"),
  };

  const parsed = userPublicSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
