import {
  feedItemSchema,
  feedPageSchema,
  followListResponseSchema,
  liveStartResponseSchema,
  liveStreamsResponseSchema,
  liveTokenResponseSchema,
  type FeedItem,
  type FeedPage,
  type LiveStartResponse,
  type LiveStreamCard,
  type LiveTokenResponse,
  type UserPublic,
} from "@shared/contracts";
import { apiRequest, apiUploadForm } from "@/lib/apiClient";
import { asNonNegInt, isRecord } from "@/lib/isRecord";
import { rankStemItems } from "@/features/feed/stemRank";

const FOR_YOU_PAGE_SIZE = 20;

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function mapProductionFeedVideo(raw: Record<string, unknown>): FeedItem | null {
  const nested = isRecord(raw.user) ? raw.user : null;
  const stats = isRecord(raw.stats) ? raw.stats : null;
  const music = isRecord(raw.music) ? raw.music : null;
  const id = asText(raw.id);
  const userId = asText(nested?.id) || asText(raw.userId) || asText(raw.user_id);
  const username = asText(nested?.username) || asText(raw.username);
  if (!id || !userId || !username) return null;
  const displayName =
    asText(nested?.name) || asText(nested?.displayName) || asText(nested?.display_name) || asText(raw.displayName) || username;
  const mediaUrl = asText(raw.mediaUrl) || asText(raw.url) || asText(raw.video_url);
  const thumbnail =
    asText(raw.thumbnailUrl) || asText(raw.thumbnail) || asText(raw.thumbnail_url) || asText(raw.thumb_url);
  const parsed = feedItemSchema.safeParse({
    id,
    kind: raw.kind === "live" ? "live" : "video",
    userId,
    username,
    displayName,
    avatarUrl: asText(nested?.avatar) || asText(nested?.avatarUrl) || asText(raw.avatarUrl) || null,
    caption: asText(raw.caption) || asText(raw.description) || undefined,
    mediaUrl: mediaUrl || undefined,
    thumbnailUrl: thumbnail || null,
    streamId: asText(raw.streamId) || asText(raw.stream_id) || undefined,
    likeCount: asNonNegInt(raw.likeCount ?? stats?.likes),
    commentCount: asNonNegInt(raw.commentCount ?? stats?.comments),
    saveCount: asNonNegInt(raw.saveCount ?? stats?.saves),
    viewCount: asNonNegInt(raw.viewCount ?? stats?.views),
    soundId: asText(raw.soundId) || asText(music?.id) || null,
    isLive: raw.isLive === true || nested?.isLive === true,
    liked: raw.liked === true || raw.isLiked === true,
    saved: raw.saved === true || raw.isSaved === true,
    isFollowing: raw.isFollowing === true,
    hashtags: Array.isArray(raw.hashtags)
      ? raw.hashtags.filter((tag): tag is string => typeof tag === "string" && tag.length > 0)
      : [],
    createdAt: asText(raw.createdAt) || asText(raw.created_at) || undefined,
  });
  return parsed.success ? parsed.data : null;
}

export function parseForYouPage(data: unknown): FeedPage | null {
  const direct = feedPageSchema.safeParse(data);
  if (direct.success) return direct.data;
  if (!isRecord(data)) return null;
  const rows = Array.isArray(data.items) ? data.items : Array.isArray(data.videos) ? data.videos : null;
  if (!rows) return null;
  const items: FeedItem[] = [];
  for (const row of rows) {
    const directItem = feedItemSchema.safeParse(row);
    if (directItem.success) {
      items.push(directItem.data);
      continue;
    }
    if (!isRecord(row)) continue;
    const mapped = mapProductionFeedVideo(row);
    if (mapped) items.push(mapped);
  }
  if (rows.length > 0 && items.length === 0) return null;
  let nextCursor = typeof data.nextCursor === "string" && data.nextCursor ? data.nextCursor : null;
  if (!nextCursor && data.hasMore === true) {
    const page = Math.max(1, asNonNegInt(data.page, 1));
    const limit = Math.max(1, asNonNegInt(data.limit, FOR_YOU_PAGE_SIZE));
    nextCursor = `off:${page * limit}`;
  }
  return { items, nextCursor };
}

function forYouQuery(cursor?: string | null): string {
  const params = new URLSearchParams();
  if (cursor) {
    params.set("cursor", cursor);
    if (cursor.startsWith("off:")) {
      const offset = Number(cursor.slice(4));
      if (Number.isFinite(offset) && offset >= 0) {
        params.set("page", String(Math.floor(offset / FOR_YOU_PAGE_SIZE) + 1));
        params.set("limit", String(FOR_YOU_PAGE_SIZE));
      }
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function apiFetchForYouFeed(cursor?: string | null): Promise<{
  page: FeedPage | null;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>(`/api/feed/foryou${forYouQuery(cursor)}`);
  if (error) return { page: null, error: error.message };
  const parsed = parseForYouPage(data);
  if (!parsed) return { page: null, error: "Invalid feed response" };
  return { page: parsed, error: null };
}

export async function apiFetchFeed(cursor?: string | null): Promise<{
  page: FeedPage | null;
  error: string | null;
}> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const { data, error } = await apiRequest<unknown>(`/api/feed${qs}`);
  if (error) return { page: null, error: error.message };
  const parsed = feedPageSchema.safeParse(data);
  if (!parsed.success) return { page: null, error: "Invalid feed response" };
  return { page: parsed.data, error: null };
}

export async function apiTrackView(
  videoId: string,
  extra?: { watchTime?: number; videoDuration?: number; completed?: boolean },
): Promise<{ counted: boolean } | { ok: false; error: string }> {
  const { data, error } = await apiRequest<unknown>("/api/feed/track-view", {
    method: "POST",
    body: JSON.stringify({ videoId, ...extra }),
  });
  if (error) return { ok: false, error: error.message };
  if (!isRecord(data)) return { ok: false, error: "Invalid view response" };
  return { counted: data.counted === true };
}

export async function apiMusicPreview(soundId: string): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await apiRequest<unknown>(`/api/music/tracks/${encodeURIComponent(soundId)}/preview`);
  if (error) return { url: null, error: error.message };
  if (!isRecord(data) || typeof data.url !== "string" || !data.url) return { url: null, error: "Preview is not available" };
  return { url: data.url, error: null };
}

export async function apiFetchStories(): Promise<{
  users: Array<{
    userId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    stories: Array<{ id: string; mediaUrl: string; thumbnailUrl: string | null }>;
  }>;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/stories");
  if (error) return { users: [], error: error.message };
  if (!isRecord(data) || !Array.isArray(data.users)) return { users: [], error: "Invalid stories" };
  const users: Array<{
    userId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    stories: Array<{ id: string; mediaUrl: string; thumbnailUrl: string | null }>;
  }> = [];
  for (const raw of data.users) {
    if (!isRecord(raw) || typeof raw.userId !== "string") continue;
    const storiesRaw = Array.isArray(raw.stories) ? raw.stories : [];
    const stories = storiesRaw
      .filter(isRecord)
      .map((row) => ({
        id: typeof row.id === "string" ? row.id : "",
        mediaUrl: typeof row.mediaUrl === "string" ? row.mediaUrl : "",
        thumbnailUrl: typeof row.thumbnailUrl === "string" ? row.thumbnailUrl : null,
      }))
      .filter((row) => row.id && row.mediaUrl);
    if (stories.length === 0) continue;
    users.push({
      userId: raw.userId,
      username: typeof raw.username === "string" ? raw.username : "",
      displayName: typeof raw.displayName === "string" ? raw.displayName : "",
      avatarUrl: typeof raw.avatarUrl === "string" ? raw.avatarUrl : null,
      stories,
    });
  }
  return { users, error: null };
}

export async function apiTrackInteraction(
  videoId: string,
  type: "like" | "comment" | "share" | "save",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>("/api/feed/track-interaction", {
    method: "POST",
    body: JSON.stringify({ videoId, type }),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function apiFetchVideoComments(videoId: string): Promise<{
  comments: Array<{
    id: string;
    userId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    body: string;
    createdAt: string;
    likeCount: number;
  }>;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>(`/api/videos/${encodeURIComponent(videoId)}/comments`);
  if (error) return { comments: [], error: error.message };
  if (!isRecord(data) || !Array.isArray(data.comments)) return { comments: [], error: "Invalid comments" };
  const comments: Array<{
    id: string;
    userId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    body: string;
    createdAt: string;
    likeCount: number;
  }> = [];
  for (const raw of data.comments) {
    if (!isRecord(raw) || typeof raw.id !== "string") continue;
    comments.push({
      id: raw.id,
      userId: typeof raw.userId === "string" ? raw.userId : "",
      username: typeof raw.username === "string" ? raw.username : "",
      displayName: typeof raw.displayName === "string" ? raw.displayName : "",
      avatarUrl: typeof raw.avatarUrl === "string" ? raw.avatarUrl : null,
      body: typeof raw.body === "string" ? raw.body : "",
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
      likeCount: typeof raw.likeCount === "number" ? raw.likeCount : 0,
    });
  }
  return { comments, error: null };
}

export async function apiPostVideoComment(
  videoId: string,
  body: string,
): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const { data, error } = await apiRequest<unknown>(`/api/videos/${encodeURIComponent(videoId)}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: isRecord(data) && typeof data.id === "string" ? data.id : undefined };
}

export async function apiFetchFollowingFeed(cursor?: string | null): Promise<{
  page: FeedPage | null;
  error: string | null;
}> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const { data, error } = await apiRequest<unknown>(`/api/feed/following${qs}`);
  if (error) return { page: null, error: error.message };
  const parsed = feedPageSchema.safeParse(data);
  if (!parsed.success) return { page: null, error: "Invalid feed response" };
  return { page: parsed.data, error: null };
}

export async function apiFetchFriendsFeed(cursor?: string | null): Promise<{
  page: FeedPage | null;
  error: string | null;
}> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const { data, error } = await apiRequest<unknown>(`/api/feed/friends${qs}`);
  if (error) return { page: null, error: error.message };
  const parsed = feedPageSchema.safeParse(data);
  if (!parsed.success) return { page: null, error: "Invalid feed response" };
  return { page: parsed.data, error: null };
}

export async function apiFetchStemFeed(cursor?: string | null): Promise<{
  page: FeedPage | null;
  error: string | null;
}> {
  if (cursor) return { page: { items: [], nextCursor: null }, error: null };
  const { data, error } = await apiRequest<unknown>("/api/videos");
  if (error) return { page: null, error: error.message };
  const rows = isRecord(data) && Array.isArray(data.videos) ? data.videos : isRecord(data) && Array.isArray(data.items) ? data.items : null;
  if (!rows) {
    const parsed = parseForYouPage(data);
    if (!parsed) return { page: null, error: "Invalid feed response" };
    return { page: { items: rankStemItems(parsed.items), nextCursor: null }, error: null };
  }
  const mapped: FeedItem[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    if (asText(row.privacy) === "private") continue;
    const direct = feedItemSchema.safeParse(row);
    const item = direct.success ? direct.data : mapProductionFeedVideo(row);
    if (item?.mediaUrl) mapped.push(item);
  }
  return { page: { items: rankStemItems(mapped), nextCursor: null }, error: null };
}

export async function apiLikeVideo(videoId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/videos/${encodeURIComponent(videoId)}/like`, {
    method: "POST",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function apiUnlikeVideo(videoId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/videos/${encodeURIComponent(videoId)}/like`, {
    method: "DELETE",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function apiSaveVideo(videoId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/videos/${encodeURIComponent(videoId)}/save`, {
    method: "POST",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function apiUnsaveVideo(videoId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/videos/${encodeURIComponent(videoId)}/save`, {
    method: "DELETE",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function apiFetchProfile(userId: string): Promise<{
  profile: UserPublic | null;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>(`/api/profiles/${encodeURIComponent(userId)}`);
  if (error) return { profile: null, error: error.message };
  if (!isRecord(data)) return { profile: null, error: "Invalid profile" };
  const nested = data.user ?? data.profile ?? data;
  const { userPublicSchema } = await import("@shared/contracts");
  const parsed = userPublicSchema.safeParse(nested);
  if (!parsed.success) return { profile: null, error: "Invalid profile" };
  return { profile: parsed.data, error: null };
}

export async function apiPatchProfile(body: {
  displayName?: string;
  bio?: string;
  username?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>("/api/profiles/me", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function apiFollow(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/profiles/${encodeURIComponent(userId)}/follow`, {
    method: "POST",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function apiUnfollow(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/profiles/${encodeURIComponent(userId)}/follow`, {
    method: "DELETE",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function apiFollowList(
  userId: string,
  kind: "followers" | "following",
): Promise<{ users: UserPublic[]; error: string | null }> {
  const { data, error } = await apiRequest<unknown>(
    `/api/profiles/${encodeURIComponent(userId)}/${kind}`,
  );
  if (error) return { users: [], error: error.message };
  const parsed = followListResponseSchema.safeParse(data);
  if (!parsed.success) return { users: [], error: "Invalid follow list" };
  return { users: parsed.data.users, error: null };
}

export async function apiLiveStreams(): Promise<{
  streams: LiveStreamCard[];
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/live/streams");
  if (error) return { streams: [], error: error.message };
  const parsed = liveStreamsResponseSchema.safeParse(data);
  if (!parsed.success) return { streams: [], error: "Invalid live list" };
  return { streams: parsed.data.streams, error: null };
}

export async function apiLiveStart(title?: string): Promise<{
  session: LiveStartResponse | null;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/live/start", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  if (error) return { session: null, error: error.message };
  const parsed = liveStartResponseSchema.safeParse(data);
  if (!parsed.success) return { session: null, error: "Invalid live start response" };
  return { session: parsed.data, error: null };
}

export async function apiLiveToken(
  roomId: string,
  role: "host" | "spectator" | "cohost",
): Promise<{
  token: LiveTokenResponse | null;
  error: string | null;
}> {
  const qs = `?roomId=${encodeURIComponent(roomId)}&role=${encodeURIComponent(role)}`;
  const { data, error } = await apiRequest<unknown>(`/api/live/token${qs}`);
  if (error) return { token: null, error: error.message };
  const parsed = liveTokenResponseSchema.safeParse(data);
  if (!parsed.success) return { token: null, error: "Invalid live token" };
  return { token: parsed.data, error: null };
}

export async function apiLiveEnd(streamId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/live/${encodeURIComponent(streamId)}/end`, {
    method: "POST",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function apiFetchSavedFeed(cursor?: string | null): Promise<{
  page: FeedPage | null;
  error: string | null;
}> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const { data, error } = await apiRequest<unknown>(`/api/videos/saved/list${qs}`);
  if (error) return { page: null, error: error.message };
  const parsed = feedPageSchema.safeParse(data);
  if (!parsed.success) return { page: null, error: "Invalid saved feed" };
  return { page: parsed.data, error: null };
}

export async function apiFetchHashtagFeed(tag: string, cursor?: string | null): Promise<{
  page: FeedPage | null;
  error: string | null;
}> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const { data, error } = await apiRequest<unknown>(`/api/hashtags/${encodeURIComponent(tag)}/videos${qs}`);
  if (error) return { page: null, error: error.message };
  const parsed = feedPageSchema.safeParse(data);
  if (!parsed.success) return { page: null, error: "Invalid hashtag feed" };
  return { page: parsed.data, error: null };
}

export async function apiFetchMusicFeed(soundId: string, cursor?: string | null): Promise<{
  page: FeedPage | null;
  error: string | null;
}> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const { data, error } = await apiRequest<unknown>(`/api/music/videos/${encodeURIComponent(soundId)}${qs}`);
  if (error) return { page: null, error: error.message };
  const parsed = feedPageSchema.safeParse(data);
  if (!parsed.success) return { page: null, error: "Invalid music feed" };
  return { page: parsed.data, error: null };
}

export async function apiFetchUserVideos(
  userId: string,
  privacy: "public" | "private" = "public",
  cursor?: string | null,
): Promise<{ page: FeedPage | null; error: string | null }> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (privacy === "private") params.set("privacy", "private");
  const qs = params.toString() ? `?${params}` : "";
  const { data, error } = await apiRequest<unknown>(`/api/videos/user/${encodeURIComponent(userId)}${qs}`);
  if (error) return { page: null, error: error.message };
  const parsed = feedPageSchema.safeParse(data);
  if (!parsed.success) return { page: null, error: "Invalid user videos" };
  return { page: parsed.data, error: null };
}

export async function apiFetchLikedFeed(cursor?: string | null): Promise<{
  page: FeedPage | null;
  error: string | null;
}> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const { data, error } = await apiRequest<unknown>(`/api/videos/liked/list${qs}`);
  if (error) return { page: null, error: error.message };
  const parsed = feedPageSchema.safeParse(data);
  if (!parsed.success) return { page: null, error: "Invalid liked feed" };
  return { page: parsed.data, error: null };
}

export async function apiFetchReposts(userId: string, cursor?: string | null): Promise<{
  page: FeedPage | null;
  error: string | null;
}> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const { data, error } = await apiRequest<unknown>(`/api/reposts/${encodeURIComponent(userId)}${qs}`);
  if (error) return { page: null, error: error.message };
  const parsed = feedPageSchema.safeParse(data);
  if (!parsed.success) return { page: null, error: "Invalid reposts" };
  return { page: parsed.data, error: null };
}

export async function apiUploadAvatar(file: Blob, filename = "avatar.jpg"): Promise<{
  avatarUrl: string | null;
  error: string | null;
}> {
  const body = new FormData();
  body.append("file", file, filename);
  const { data, error } = await apiUploadForm<unknown>("/api/profiles/me/avatar", body);
  if (error) return { avatarUrl: null, error: error.message };
  if (!isRecord(data) || typeof data.avatarUrl !== "string") return { avatarUrl: null, error: "Avatar upload failed" };
  return { avatarUrl: data.avatarUrl, error: null };
}

export async function apiUploadVideo(
  file: Blob,
  caption?: string,
  filename = "clip.webm",
  extra?: { soundId?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const body = new FormData();
  body.append("file", file, filename);
  if (caption) body.append("caption", caption);
  if (extra?.soundId) body.append("soundId", extra.soundId);
  const { error } = await apiUploadForm<unknown>("/api/videos/upload", body);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
