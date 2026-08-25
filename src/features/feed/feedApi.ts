import {
  feedVideoSchema,
  forYouFeedResponseSchema,
  followListResponseSchema,
  liveStartResponseSchema,
  liveStreamCardSchema,
  liveStreamsResponseSchema,
  liveTokenResponseSchema,
  relationFeedResponseSchema,
  type FeedVideo,
  type ForYouFeedResponse,
  type LiveStartResponse,
  type LiveStreamCard,
  type LiveTokenResponse,
  type RelationFeedResponse,
  type UserPublic,
} from "@shared/contracts";
import { Capacitor } from "@capacitor/core";
import { apiRequest } from "@/lib/apiClient";
import { decodeUserPublicFromPayload } from "@/lib/decodeUserPublic";
import { apiUrl } from "@/lib/api";
import { getSessionToken } from "@/lib/sessionToken";
import { isRecord } from "@/lib/isRecord";
import { normalizeHashtag } from "@shared/hashtag";
export { apiLikeVideo, apiUnlikeVideo, apiSaveVideo, apiUnsaveVideo } from "./engagementApi";

export function parseForYouPage(data: unknown): ForYouFeedResponse | null {
  const parsed = forYouFeedResponseSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export type FeedVideoPage = {
  videos: FeedVideo[];
  nextCursor: string | null;
};

export function parseFeedVideos(rawList: unknown): FeedVideo[] {
  if (!Array.isArray(rawList)) return [];
  const videos: FeedVideo[] = [];
  for (const raw of rawList) {
    const parsed = feedVideoSchema.safeParse(raw);
    if (parsed.success) videos.push(parsed.data);
  }
  return videos;
}

export function parseFeedVideoPage(data: unknown): FeedVideoPage | null {
  if (!isRecord(data) || !Array.isArray(data.videos)) return null;
  const nextCursor =
    typeof data.nextCursor === "string" ? data.nextCursor : data.nextCursor === null ? null : null;
  return { videos: parseFeedVideos(data.videos), nextCursor };
}

export function parseRelationFeed(data: unknown): RelationFeedResponse | null {
  const parsed = relationFeedResponseSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

function stemFeedCursorQuery(cursor?: string | null): string {
  return cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
}

export async function apiFetchForYouFeed(
  page = 1,
  limit = 20,
): Promise<{
  page: ForYouFeedResponse | null;
  error: string | null;
  status?: number;
}> {
  const qs = `?page=${encodeURIComponent(String(page))}&limit=${encodeURIComponent(String(limit))}`;
  const { data, error } = await apiRequest<unknown>(`/api/feed/foryou${qs}`);
  if (error) return { page: null, error: error.message, status: error.status };
  const parsed = parseForYouPage(data);
  if (!parsed) return { page: null, error: "Invalid feed response" };
  return { page: parsed, error: null };
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

export async function apiFetchFollowingFeed(): Promise<{
  feed: RelationFeedResponse | null;
  error: string | null;
  status?: number;
}> {
  const { data, error } = await apiRequest<unknown>("/api/feed/following");
  if (error) return { feed: null, error: error.message, status: error.status };
  const parsed = parseRelationFeed(data);
  if (!parsed) return { feed: null, error: "Invalid feed response" };
  return { feed: parsed, error: null };
}

export async function apiFetchFriendsFeed(): Promise<{
  feed: RelationFeedResponse | null;
  error: string | null;
  status?: number;
}> {
  const { data, error } = await apiRequest<unknown>("/api/feed/friends");
  if (error) return { feed: null, error: error.message, status: error.status };
  const parsed = parseRelationFeed(data);
  if (!parsed) return { feed: null, error: "Invalid feed response" };
  return { feed: parsed, error: null };
}

export async function apiFetchStemFeed(cursor?: string | null): Promise<{
  page: FeedVideoPage | null;
  error: string | null;
  status?: number;
}> {
  const qs = stemFeedCursorQuery(cursor);
  const { data, error } = await apiRequest<unknown>(`/api/feed/stem${qs}`);
  if (error) return { page: null, error: error.message, status: error.status };
  const parsed = parseFeedVideoPage(data);
  if (!parsed) return { page: null, error: "Invalid feed response" };
  return { page: parsed, error: null };
}

export async function apiFetchVideoById(videoId: string): Promise<{
  video: FeedVideo | null;
  error: string | null;
  status?: number;
}> {
  const id = videoId.trim();
  if (!id) return { video: null, error: "Video not found", status: 404 };
  const { data, error } = await apiRequest<unknown>(`/api/videos/${encodeURIComponent(id)}`);
  if (error) return { video: null, error: error.message, status: error.status };
  const parsed = feedVideoSchema.safeParse(data);
  if (!parsed.success) {
    return { video: null, error: "Invalid video", status: 502 };
  }
  if (!parsed.data.url.trim()) {
    return { video: null, error: "Video not found", status: 404 };
  }
  return { video: parsed.data, error: null };
}


export async function apiDownloadVoiceOnlyVideo(
  videoId: string,
): Promise<{ ok: true; blob: Blob; filename: string } | { ok: false; error: string }> {
  const token = getSessionToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(apiUrl(`/api/videos/${encodeURIComponent(videoId)}/download`), {
      method: "GET",
      credentials: Capacitor.isNativePlatform() ? "omit" : "include",
      headers,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      return { ok: false, error: body?.message || body?.error || `Download failed (${res.status})` };
    }
    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") || "";
    const named = /filename="([^"]+)"/i.exec(disposition);
    return { ok: true, blob, filename: named?.[1] || `video_${videoId}.mp4` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Download failed" };
  }
}


export async function apiFetchProfile(userId: string): Promise<{
  profile: UserPublic | null;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>(`/api/profiles/${encodeURIComponent(userId)}`);
  if (error) return { profile: null, error: error.message };
  const profile = decodeUserPublicFromPayload(data);
  if (!profile) return { profile: null, error: "Invalid profile" };
  return { profile, error: null };
}

export async function apiFetchProfiles(): Promise<{
  profiles: Array<{
    user_id: string;
    username: string;
    display_name: string;
    avatar_url: string;
  }>;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/profiles");
  if (error) return { profiles: [], error: error.message };
  const rows = isRecord(data) && Array.isArray(data.profiles) ? data.profiles : [];
  const profiles = rows
    .map((row) => {
      if (!isRecord(row)) return null;
      const user_id = typeof row.user_id === "string" ? row.user_id : "";
      if (!user_id) return null;
      const username = typeof row.username === "string" ? row.username : "user";
      return {
        user_id,
        username,
        display_name: typeof row.display_name === "string" ? row.display_name : username,
        avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : "",
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  return { profiles, error: null };
}

export async function apiFollow(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/profiles/${encodeURIComponent(userId)}/follow`, {
    method: "POST",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function apiUnfollow(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/profiles/${encodeURIComponent(userId)}/unfollow`, {
    method: "POST",
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

export function mapLiveStreamCard(raw: unknown): LiveStreamCard | null {
  const parsed = liveStreamCardSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseLiveStreamsResponse(data: unknown): LiveStreamCard[] | null {
  const parsed = liveStreamsResponseSchema.safeParse(data);
  return parsed.success ? parsed.data.streams : null;
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
    body: JSON.stringify({ title: title?.trim() || undefined }),
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
  status?: number;
}> {
  const qs = `?roomId=${encodeURIComponent(roomId)}&role=${encodeURIComponent(role)}`;
  const { data, error } = await apiRequest<unknown>(`/api/live/token${qs}`);
  if (error) return { token: null, error: error.message, status: error.status };
  const parsed = liveTokenResponseSchema.safeParse(data);
  if (!parsed.success) return { token: null, error: "Invalid live token" };
  return { token: parsed.data, error: null };
}

export type LiveStatus = {
  room: string;
  active: boolean;
  hostUserId?: string;
};

/** GET /api/live/status?room= — authoritative active flag for For You live cards. */
export async function apiLiveStatus(room: string): Promise<{
  status: LiveStatus | null;
  error: string | null;
}> {
  const qs = `room=${encodeURIComponent(room)}`;
  const { data, error } = await apiRequest<unknown>(`/api/live/status?${qs}`);
  if (error) return { status: null, error: error.message };
  if (!isRecord(data)) return { status: null, error: "Invalid live status" };
  const resolvedRoom = typeof data.room === "string" ? data.room : room;
  const active = Boolean(data.active);
  const hostUserId = typeof data.hostUserId === "string" ? data.hostUserId : undefined;
  return { status: { room: resolvedRoom, active, hostUserId }, error: null };
}

export async function apiLiveEnd(streamId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await apiRequest<unknown>(`/api/live/${encodeURIComponent(streamId)}/end`, {
    method: "POST",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type SavedVideoHit = {
  id: string;
  thumbnailUrl: string | null;
  viewCount: number;
  mediaUrl: string;
  userId: string;
  username: string;
  displayName: string;
};

function parseSavedHit(raw: unknown): SavedVideoHit | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id.trim()) return null;
  const mediaUrl = typeof raw.mediaUrl === "string" ? raw.mediaUrl.trim() : "";
  const userId = typeof raw.userId === "string" ? raw.userId.trim() : "";
  if (!mediaUrl || !userId) return null;
  return {
    id: raw.id,
    thumbnailUrl: typeof raw.thumbnailUrl === "string" && raw.thumbnailUrl.trim() ? raw.thumbnailUrl : null,
    viewCount: typeof raw.viewCount === "number" && Number.isFinite(raw.viewCount) ? Math.max(0, raw.viewCount) : 0,
    mediaUrl,
    userId,
    username: typeof raw.username === "string" ? raw.username : "",
    displayName: typeof raw.displayName === "string" ? raw.displayName : "",
  };
}

export async function apiFetchSavedVideos(
  limit: number = 50,
  offset: number = 0,
): Promise<{
  videos: SavedVideoHit[];
  hasMore: boolean;
  limit: number;
  offset: number;
  error: string | null;
  status?: number;
}> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const safeOffset = Math.max(offset, 0);
  const { data, error } = await apiRequest<unknown>(
    `/api/videos/saved/list?limit=${safeLimit}&offset=${safeOffset}`,
  );
  if (error) {
    return { videos: [], hasMore: false, limit: safeLimit, offset: safeOffset, error: error.message, status: error.status };
  }
  if (!isRecord(data) || !Array.isArray(data.videos)) {
    return { videos: [], hasMore: false, limit: safeLimit, offset: safeOffset, error: "Invalid saved videos" };
  }
  const videos: SavedVideoHit[] = [];
  for (const raw of data.videos) {
    const hit = parseSavedHit(raw);
    if (hit) videos.push(hit);
  }
  return {
    videos,
    hasMore: data.hasMore === true,
    limit: typeof data.limit === "number" ? data.limit : safeLimit,
    offset: typeof data.offset === "number" ? data.offset : safeOffset,
    error: null,
  };
}

export async function apiFetchSavedFeed(cursor?: string | null): Promise<{
  page: FeedVideoPage | null;
  error: string | null;
}> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const { data, error } = await apiRequest<unknown>(`/api/videos/saved/feed${qs}`);
  if (error) return { page: null, error: error.message };
  const parsed = parseFeedVideoPage(data);
  if (!parsed) return { page: null, error: "Invalid saved videos" };
  return { page: parsed, error: null };
}

export async function apiFetchUserSavedFeed(
  userId: string,
  cursor?: string | null,
): Promise<{ page: FeedVideoPage | null; error: string | null }> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const { data, error } = await apiRequest<unknown>(
    `/api/videos/user/${encodeURIComponent(userId)}/saved${qs}`,
  );
  if (error) return { page: null, error: error.message };
  const parsed = parseFeedVideoPage(data);
  if (!parsed) return { page: null, error: "Invalid saved videos" };
  return { page: parsed, error: null };
}

export async function apiFetchUserLikedFeed(
  userId: string,
  cursor?: string | null,
): Promise<{ page: FeedVideoPage | null; error: string | null }> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const { data, error } = await apiRequest<unknown>(
    `/api/videos/user/${encodeURIComponent(userId)}/liked${qs}`,
  );
  if (error) return { page: null, error: error.message };
  const parsed = parseFeedVideoPage(data);
  if (!parsed) return { page: null, error: "Invalid liked feed" };
  return { page: parsed, error: null };
}

export type HashtagVideoHit = {
  id: string;
  thumbnailUrl: string | null;
  viewCount: number;
};

export async function apiFetchHashtag(tag: string): Promise<{
  tag: string;
  useCount: number;
  videos: HashtagVideoHit[];
  error: string | null;
}> {
  const normalized = normalizeHashtag(tag);
  if (!normalized) return { tag: "", useCount: 0, videos: [], error: null };
  const { data, error } = await apiRequest<unknown>(`/api/hashtags/${encodeURIComponent(normalized)}`);
  if (error) return { tag: normalized, useCount: 0, videos: [], error: error.message };
  if (!isRecord(data) || !Array.isArray(data.videos)) {
    return { tag: normalized, useCount: 0, videos: [], error: "Invalid hashtag response" };
  }
  const videos: HashtagVideoHit[] = [];
  for (const raw of data.videos) {
    if (!isRecord(raw) || typeof raw.id !== "string") continue;
    videos.push({
      id: raw.id,
      thumbnailUrl: typeof raw.thumbnailUrl === "string" ? raw.thumbnailUrl : null,
      viewCount: Number(raw.viewCount ?? 0),
    });
  }
  return {
    tag: typeof data.tag === "string" ? data.tag : normalized,
    useCount: Number(data.useCount ?? 0),
    videos,
    error: null,
  };
}

export async function apiFetchUserVideos(
  userId: string,
  privacy: "public" | "private" = "public",
  cursor?: string | null,
): Promise<{ page: FeedVideoPage | null; error: string | null }> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (privacy === "private") params.set("privacy", "private");
  const qs = params.toString() ? `?${params}` : "";
  const { data, error } = await apiRequest<unknown>(`/api/videos/user/${encodeURIComponent(userId)}${qs}`);
  if (error) return { page: null, error: error.message };
  const parsed = parseFeedVideoPage(data);
  if (!parsed) return { page: null, error: "Invalid user videos" };
  return { page: parsed, error: null };
}

export async function apiFetchLikedFeed(cursor?: string | null): Promise<{
  page: FeedVideoPage | null;
  error: string | null;
}> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const { data, error } = await apiRequest<unknown>(`/api/videos/liked/list${qs}`);
  if (error) return { page: null, error: error.message };
  const parsed = parseFeedVideoPage(data);
  if (!parsed) return { page: null, error: "Invalid liked feed" };
  return { page: parsed, error: null };
}

export async function apiFetchReposts(userId: string, cursor?: string | null): Promise<{
  page: FeedVideoPage | null;
  error: string | null;
}> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const { data, error } = await apiRequest<unknown>(`/api/reposts/${encodeURIComponent(userId)}${qs}`);
  if (error) return { page: null, error: error.message };
  const parsed = parseFeedVideoPage(data);
  if (!parsed) return { page: null, error: "Invalid reposts" };
  return { page: parsed, error: null };
}

export type DiscoverHashtag = { tag: string; useCount: number };
export type DiscoverRanking = {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  totalCoins: number;
};
export type DiscoverSearchUser = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  followerCount: number;
  isFollowing: boolean;
};

export async function apiFetchDiscover(): Promise<{
  trending: FeedVideo[];
  hashtags: DiscoverHashtag[];
  rankings: DiscoverRanking[];
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/discover");
  if (error) return { trending: [], hashtags: [], rankings: [], error: error.message };
  if (!isRecord(data) || !Array.isArray(data.trending) || !Array.isArray(data.hashtags) || !Array.isArray(data.rankings)) {
    return { trending: [], hashtags: [], rankings: [], error: "Invalid discover response" };
  }
  const trending = parseFeedVideos(data.trending);
  const hashtags: DiscoverHashtag[] = [];
  for (const raw of data.hashtags) {
    if (!isRecord(raw) || typeof raw.tag !== "string" || !raw.tag.trim()) continue;
    hashtags.push({ tag: raw.tag.replace(/^#/, "").trim(), useCount: Number(raw.useCount ?? 0) });
  }
  const rankings: DiscoverRanking[] = [];
  for (const raw of data.rankings) {
    if (!isRecord(raw) || typeof raw.userId !== "string") continue;
    rankings.push({
      rank: Number(raw.rank ?? rankings.length + 1),
      userId: raw.userId,
      username: typeof raw.username === "string" ? raw.username : "",
      displayName: typeof raw.displayName === "string" ? raw.displayName : "",
      avatarUrl: typeof raw.avatarUrl === "string" ? raw.avatarUrl : null,
      totalCoins: Number(raw.totalCoins ?? 0),
    });
  }
  return { trending, hashtags, rankings, error: null };
}

export async function apiDiscoverSearch(query: string): Promise<{
  users: DiscoverSearchUser[];
  videos: FeedVideo[];
  error: string | null;
}> {
  const q = query.trim();
  if (q.length < 2) return { users: [], videos: [], error: null };
  const { data, error } = await apiRequest<unknown>(`/api/discover/search?q=${encodeURIComponent(q)}`);
  if (error) return { users: [], videos: [], error: error.message };
  if (!isRecord(data) || !Array.isArray(data.users) || !Array.isArray(data.videos)) {
    return { users: [], videos: [], error: "Invalid discover search response" };
  }
  const users: DiscoverSearchUser[] = [];
  for (const raw of data.users) {
    if (!isRecord(raw) || typeof raw.userId !== "string") continue;
    users.push({
      userId: raw.userId,
      username: typeof raw.username === "string" ? raw.username : "",
      displayName: typeof raw.displayName === "string" ? raw.displayName : "",
      avatarUrl: typeof raw.avatarUrl === "string" ? raw.avatarUrl : null,
      followerCount: Number(raw.followerCount ?? 0),
      isFollowing: Boolean(raw.isFollowing),
    });
  }
  return { users, videos: parseFeedVideos(data.videos), error: null };
}

export type SearchUserHit = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export async function apiFetchSearch(opts: { q?: string; category?: string }): Promise<{
  users: SearchUserHit[];
  videos: FeedVideo[];
  error: string | null;
}> {
  const q = (opts.q || "").trim();
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (opts.category) params.set("category", opts.category);
  const qs = params.toString();
  const { data, error } = await apiRequest<unknown>(`/api/search${qs ? `?${qs}` : ""}`);
  if (error) return { users: [], videos: [], error: error.message };
  if (!isRecord(data) || !Array.isArray(data.users) || !Array.isArray(data.videos)) {
    return { users: [], videos: [], error: "Invalid search response" };
  }
  const users: SearchUserHit[] = [];
  for (const raw of data.users) {
    if (!isRecord(raw) || typeof raw.userId !== "string") continue;
    users.push({
      userId: raw.userId,
      username: typeof raw.username === "string" ? raw.username : "",
      displayName: typeof raw.displayName === "string" ? raw.displayName : "",
      avatarUrl: typeof raw.avatarUrl === "string" ? raw.avatarUrl : null,
    });
  }
  return { users, videos: parseFeedVideos(data.videos), error: null };
}
