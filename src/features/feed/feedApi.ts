import {
  feedItemSchema,
  feedPageSchema,
  followListResponseSchema,
  liveStartResponseSchema,
  liveStreamCardSchema,
  liveTokenResponseSchema,
  type FeedItem,
  type FeedPage,
  type LiveStartResponse,
  type LiveStreamCard,
  type LiveTokenResponse,
  type UserPublic,
} from "@shared/contracts";
import { apiRequest, apiUploadForm } from "@/lib/apiClient";
import { apiMutate, type MutationResult } from "@/lib/apiResult";
import { asNonNegInt, isRecord } from "@/lib/isRecord";
import { rankStemItems } from "@/features/feed/stemRank";

const FOR_YOU_PAGE_SIZE = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asUuid(value: unknown): string {
  const text = asText(value);
  return UUID_RE.test(text) ? text : "";
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

/**
 * Fetches a `feedPageSchema` page from a cursor-paginated endpoint.
 * `extraParams` carries endpoint-specific query values alongside the cursor.
 */
async function fetchFeedPage(
  path: string,
  cursor: string | null | undefined,
  invalidMessage: string,
  extraParams?: Record<string, string>,
): Promise<{ page: FeedPage | null; error: string | null }> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  for (const [key, value] of Object.entries(extraParams ?? {})) params.set(key, value);
  const qs = params.toString() ? `?${params}` : "";
  const { data, error } = await apiRequest<unknown>(`${path}${qs}`);
  if (error) return { page: null, error: error.message };
  const parsed = feedPageSchema.safeParse(data);
  if (!parsed.success) return { page: null, error: invalidMessage };
  return { page: parsed.data, error: null };
}

export async function apiFetchFeed(cursor?: string | null): Promise<{
  page: FeedPage | null;
  error: string | null;
}> {
  return fetchFeedPage("/api/feed", cursor, "Invalid feed response");
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
): Promise<MutationResult> {
  return apiMutate("/api/feed/track-interaction", "POST", { videoId, type });
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
  return fetchFeedPage("/api/feed/following", cursor, "Invalid feed response");
}

export async function apiFetchFriendsFeed(cursor?: string | null): Promise<{
  page: FeedPage | null;
  error: string | null;
}> {
  return fetchFeedPage("/api/feed/friends", cursor, "Invalid feed response");
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

export async function apiLikeVideo(videoId: string): Promise<MutationResult> {
  return apiMutate(`/api/videos/${encodeURIComponent(videoId)}/like`, "POST");
}

export async function apiUnlikeVideo(videoId: string): Promise<MutationResult> {
  return apiMutate(`/api/videos/${encodeURIComponent(videoId)}/like`, "DELETE");
}

export async function apiSaveVideo(videoId: string): Promise<MutationResult> {
  return apiMutate(`/api/videos/${encodeURIComponent(videoId)}/save`, "POST");
}

export async function apiUnsaveVideo(videoId: string): Promise<MutationResult> {
  return apiMutate(`/api/videos/${encodeURIComponent(videoId)}/save`, "DELETE");
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
}): Promise<MutationResult> {
  return apiMutate("/api/profiles/me", "PATCH", body);
}

export async function apiFollow(userId: string): Promise<MutationResult> {
  return apiMutate(`/api/profiles/${encodeURIComponent(userId)}/follow`, "POST");
}

export async function apiUnfollow(userId: string): Promise<MutationResult> {
  return apiMutate(`/api/profiles/${encodeURIComponent(userId)}/follow`, "DELETE");
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

export function mapLiveStreamCard(raw: unknown): LiveStreamCard | null {
  const direct = liveStreamCardSchema.safeParse(raw);
  if (direct.success) return direct.data;
  if (!isRecord(raw)) return null;
  const hostId = asUuid(raw.hostId) || asUuid(raw.host_id) || asUuid(raw.user_id) || asUuid(raw.userId);
  if (!hostId) return null;
  const roomId =
    asText(raw.roomId) || asText(raw.room_id) || asText(raw.stream_key) || asText(raw.streamKey) || hostId;
  const streamId = asUuid(raw.streamId) || asUuid(raw.stream_id) || asUuid(raw.id) || asUuid(roomId) || hostId;
  const avatar = asText(raw.avatarUrl) || asText(raw.avatar_url);
  const parsed = liveStreamCardSchema.safeParse({
    streamId,
    roomId,
    hostId,
    displayName: asText(raw.displayName) || asText(raw.display_name) || asText(raw.title) || "LIVE",
    username: asText(raw.username),
    avatarUrl: avatar || null,
    title: asText(raw.title),
    viewerCount: asNonNegInt(raw.viewerCount ?? raw.viewer_count ?? raw.viewers),
    startedAt: asText(raw.startedAt) || asText(raw.started_at),
  });
  return parsed.success ? parsed.data : null;
}

export function parseLiveStreamsResponse(data: unknown): LiveStreamCard[] | null {
  if (!isRecord(data) || !Array.isArray(data.streams)) return null;
  const streams: LiveStreamCard[] = [];
  for (const row of data.streams) {
    const mapped = mapLiveStreamCard(row);
    if (mapped) streams.push(mapped);
  }
  if (data.streams.length > 0 && streams.length === 0) return null;
  return streams;
}

export async function apiLiveStreams(): Promise<{
  streams: LiveStreamCard[];
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/live/streams");
  if (error) return { streams: [], error: error.message };
  const parsed = parseLiveStreamsResponse(data);
  if (!parsed) return { streams: [], error: "Invalid live list" };
  return { streams: parsed, error: null };
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

export async function apiLiveEnd(streamId: string): Promise<MutationResult> {
  return apiMutate(`/api/live/${encodeURIComponent(streamId)}/end`, "POST");
}

export async function apiFetchSavedFeed(cursor?: string | null): Promise<{
  page: FeedPage | null;
  error: string | null;
}> {
  return fetchFeedPage("/api/videos/saved/list", cursor, "Invalid saved feed");
}

export async function apiFetchHashtagFeed(tag: string, cursor?: string | null): Promise<{
  page: FeedPage | null;
  error: string | null;
}> {
  return fetchFeedPage(
    `/api/hashtags/${encodeURIComponent(tag)}/videos`,
    cursor,
    "Invalid hashtag feed",
  );
}

export async function apiFetchMusicFeed(soundId: string, cursor?: string | null): Promise<{
  page: FeedPage | null;
  error: string | null;
}> {
  return fetchFeedPage(`/api/music/videos/${encodeURIComponent(soundId)}`, cursor, "Invalid music feed");
}

export async function apiFetchUserVideos(
  userId: string,
  privacy: "public" | "private" = "public",
  cursor?: string | null,
): Promise<{ page: FeedPage | null; error: string | null }> {
  return fetchFeedPage(
    `/api/videos/user/${encodeURIComponent(userId)}`,
    cursor,
    "Invalid user videos",
    privacy === "private" ? { privacy: "private" } : undefined,
  );
}

export async function apiFetchLikedFeed(cursor?: string | null): Promise<{
  page: FeedPage | null;
  error: string | null;
}> {
  return fetchFeedPage("/api/videos/liked/list", cursor, "Invalid liked feed");
}

export async function apiFetchReposts(userId: string, cursor?: string | null): Promise<{
  page: FeedPage | null;
  error: string | null;
}> {
  return fetchFeedPage(`/api/reposts/${encodeURIComponent(userId)}`, cursor, "Invalid reposts");
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
): Promise<MutationResult> {
  const body = new FormData();
  body.append("file", file, filename);
  if (caption) body.append("caption", caption);
  if (extra?.soundId) body.append("soundId", extra.soundId);
  const { error } = await apiUploadForm<unknown>("/api/videos/upload", body);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
