import { userPublicSchema, type UserPublic } from "@shared/contracts";
import { asNonNegInt, isRecord } from "@/lib/isRecord";

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * NEW `{ user: UserPublic }` and live OLD `{ profile: { userId, followers, … } }`.
 * Returns null when the payload cannot be mapped to UserPublic.
 */
export function mapUserPublicPayload(data: unknown): UserPublic | null {
  if (!isRecord(data)) return null;
  const nested = isRecord(data.user) ? data.user : isRecord(data.profile) ? data.profile : data;
  const direct = userPublicSchema.safeParse(nested);
  if (direct.success) return direct.data;
  if (!isRecord(nested)) return null;
  const id = asText(nested.id) || asText(nested.userId);
  if (!id || id === "me") return null;
  const username = asText(nested.username);
  if (!username) return null;
  const mapped = userPublicSchema.safeParse({
    id,
    username,
    displayName:
      asText(nested.displayName) ||
      asText(nested.display_name) ||
      asText(nested.name) ||
      username,
    avatarUrl: asText(nested.avatarUrl) || asText(nested.avatar_url) || asText(nested.avatar) || null,
    bio: asText(nested.bio) || "",
    isVerified: nested.isVerified === true || nested.is_verified === true,
    followerCount: asNonNegInt(nested.followerCount ?? nested.follower_count ?? nested.followers),
    followingCount: asNonNegInt(nested.followingCount ?? nested.following_count ?? nested.following),
    likeCount: asNonNegInt(nested.likeCount ?? nested.like_count, 0) || undefined,
    viewCount: asNonNegInt(nested.viewCount ?? nested.view_count ?? nested.uniqueProfileViews, 0) || undefined,
    isLive: nested.isLive === true || nested.is_live === true,
    isFollowing: nested.isFollowing === true || nested.is_following === true,
  });
  return mapped.success ? mapped.data : null;
}
