import { env } from "../../infra/env.js";
import { logger } from "../../infra/logger.js";
import { getPool } from "../../infra/postgres.js";
import { valkeyGet, valkeySet } from "../../infra/valkey.js";
import { AppError } from "../../middleware/errors.js";
import {
  fetchEpidemicCollections,
  fetchEpidemicHighlights,
  fetchEpidemicPickerTracks,
  isEpidemicConfigured,
  resolveEpidemicPreviewUrl,
  searchEpidemicTracks,
  type EpidemicTrack,
} from "./epidemic.js";
import { MUSIC_CACHE_TTL_MS, musicCacheKey } from "./musicCache.js";

export const LICENSED_CLIP_MAX_SECONDS = 60;

export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  duration: string;
  coverUrl: string | null;
  clipStartSeconds: number;
  clipEndSeconds: number;
  isPreviewOnly: boolean;
};

export type MusicPlaylist = {
  id: string;
  name: string;
  coverUrl: string | null;
  tracks: MusicTrack[];
};

export type LocalSoundRow = {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  cover_url: string | null;
};

async function musicCacheGet(key: string): Promise<string | null> {
  if (!env().valkeyUrl) return null;
  try {
    return await valkeyGet(key);
  } catch (error) {
    logger.warn({ err: error, key }, "music query cache read failed");
    return null;
  }
}

async function musicCacheSet(key: string, value: string, ttlMs: number): Promise<void> {
  if (!env().valkeyUrl) return;
  try {
    await valkeySet(key, value, ttlMs);
  } catch (error) {
    logger.warn({ err: error, key }, "music query cache write failed");
  }
}

export function formatClipLabel(startSeconds: number, endSeconds: number): string {
  const total = Math.max(0, Math.floor(endSeconds - startSeconds));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function licensedClipWindow(
  lengthSeconds: number,
  fromMs: number,
  toMs: number,
  maxSeconds = LICENSED_CLIP_MAX_SECONDS,
): { clipStartSeconds: number; clipEndSeconds: number } {
  let clipStartSeconds = Math.max(0, Math.floor(fromMs / 1000));
  let clipEndSeconds = Math.max(clipStartSeconds + 5, Math.ceil(toMs / 1000));
  if (clipEndSeconds - clipStartSeconds > maxSeconds) {
    clipEndSeconds = clipStartSeconds + maxSeconds;
  }
  const length = Math.max(0, lengthSeconds);
  if (length > 0) clipEndSeconds = Math.min(clipEndSeconds, length);
  if (clipEndSeconds <= clipStartSeconds) {
    clipStartSeconds = 0;
    clipEndSeconds = Math.min(maxSeconds, length || maxSeconds);
  }
  return { clipStartSeconds, clipEndSeconds };
}

async function licensedTrack(track: EpidemicTrack): Promise<MusicTrack> {
  let clip = licensedClipWindow(track.lengthSeconds, 0, LICENSED_CLIP_MAX_SECONDS * 1000);
  try {
    const highlight = await fetchEpidemicHighlights(track.id, LICENSED_CLIP_MAX_SECONDS);
    clip = licensedClipWindow(track.lengthSeconds, highlight.fromMs, highlight.toMs);
  } catch {
    clip = licensedClipWindow(
      track.lengthSeconds,
      0,
      Math.min(LICENSED_CLIP_MAX_SECONDS, track.lengthSeconds || LICENSED_CLIP_MAX_SECONDS) * 1000,
    );
  }
  return {
    id: track.id,
    title: track.title || "Sound",
    artist: track.artist,
    duration: formatClipLabel(clip.clipStartSeconds, clip.clipEndSeconds),
    coverUrl: track.coverUrl,
    clipStartSeconds: clip.clipStartSeconds,
    clipEndSeconds: clip.clipEndSeconds,
    isPreviewOnly: track.isPreviewOnly,
  };
}

export async function queryMusicStatus(): Promise<{ configured: boolean; provider: "epidemic_sound" | null }> {
  const configured = isEpidemicConfigured();
  return { configured, provider: configured ? "epidemic_sound" : null };
}

async function buildGlobalLicensedPlaylist(
  limit = 80,
  clipMaxSec = LICENSED_CLIP_MAX_SECONDS,
): Promise<MusicPlaylist> {
  const cacheKey = musicCacheKey("global_playlist", `${limit}:${clipMaxSec}`);
  const cached = await musicCacheGet(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as MusicPlaylist;
    } catch {
      /* rebuild */
    }
  }

  const pickerTracks = await fetchEpidemicPickerTracks(limit);
  const tracks = await Promise.all(pickerTracks.map(licensedTrack));
  const playlist: MusicPlaylist = {
    id: "global",
    name: "For You",
    coverUrl: tracks[0]?.coverUrl ?? null,
    tracks,
  };
  await musicCacheSet(cacheKey, JSON.stringify(playlist), MUSIC_CACHE_TTL_MS.globalPlaylist);
  return playlist;
}

export async function queryMusicGlobal(): Promise<{
  playlist: MusicPlaylist | null;
  configured: boolean;
  licensed?: boolean;
  clipMaxSeconds: number;
}> {
  if (!isEpidemicConfigured()) {
    return { playlist: null, configured: false, clipMaxSeconds: LICENSED_CLIP_MAX_SECONDS };
  }
  try {
    const playlist = await buildGlobalLicensedPlaylist(80, LICENSED_CLIP_MAX_SECONDS);
    return {
      playlist,
      configured: true,
      licensed: true,
      clipMaxSeconds: LICENSED_CLIP_MAX_SECONDS,
    };
  } catch (error) {
    logger.error({ err: error }, "queryMusicGlobal failed");
    throw new AppError("unavailable", "MUSIC_PROVIDER_ERROR", 502);
  }
}

export async function queryMusicPlaylists(opts?: {
  limit?: number;
  perPlaylist?: number;
}): Promise<{
  playlists: MusicPlaylist[];
  configured: boolean;
  clipMaxSeconds: number;
  licensed?: boolean;
}> {
  if (!isEpidemicConfigured()) {
    return { playlists: [], configured: false, clipMaxSeconds: LICENSED_CLIP_MAX_SECONDS };
  }

  const playlistLimit = Math.min(15, Math.max(1, opts?.limit ?? 10));
  const tracksPerPlaylist = Math.min(40, Math.max(5, opts?.perPlaylist ?? 30));
  const cacheKey = musicCacheKey(
    "playlists_bundle",
    `${playlistLimit}:${tracksPerPlaylist}:${LICENSED_CLIP_MAX_SECONDS}`,
  );
  const cached = await musicCacheGet(cacheKey);
  if (cached) {
    try {
      const playlists = JSON.parse(cached) as MusicPlaylist[];
      return {
        playlists,
        configured: true,
        clipMaxSeconds: LICENSED_CLIP_MAX_SECONDS,
        licensed: true,
      };
    } catch {
      /* rebuild */
    }
  }

  try {
    const global = await buildGlobalLicensedPlaylist(
      Math.min(80, tracksPerPlaylist * 2),
      LICENSED_CLIP_MAX_SECONDS,
    );
    const collections = await fetchEpidemicCollections(playlistLimit, 0);
    const playlists: MusicPlaylist[] = [global];

    for (const collection of collections) {
      if (collection.name.toLowerCase() === "for you") continue;
      if (collection.tracks.length === 0) continue;
      const tracks = await Promise.all(
        collection.tracks.slice(0, tracksPerPlaylist).map(licensedTrack),
      );
      playlists.push({
        id: collection.id || tracks[0]?.id || collection.name,
        name: collection.name,
        coverUrl: collection.coverUrl || tracks[0]?.coverUrl || null,
        tracks,
      });
    }

    await musicCacheSet(cacheKey, JSON.stringify(playlists), MUSIC_CACHE_TTL_MS.playlistsBundle);
    return {
      playlists,
      configured: true,
      clipMaxSeconds: LICENSED_CLIP_MAX_SECONDS,
      licensed: true,
    };
  } catch (error) {
    logger.error({ err: error }, "queryMusicPlaylists failed");
    throw new AppError("unavailable", "Music playlists are unavailable", 502);
  }
}

export async function queryMusicCollections(limit = 10, offset = 0): Promise<{
  collections: Array<{
    id: string;
    name: string;
    coverUrl: string | null;
    tracks: MusicTrack[];
  }>;
}> {
  if (!isEpidemicConfigured()) {
    throw new AppError("unavailable", "MUSIC_PROVIDER_NOT_CONFIGURED", 503);
  }
  try {
    const collections = await fetchEpidemicCollections(limit, offset);
    const mapped = [];
    for (const collection of collections) {
      const tracks = await Promise.all(collection.tracks.slice(0, 30).map(licensedTrack));
      mapped.push({
        id: collection.id,
        name: collection.name,
        coverUrl: collection.coverUrl,
        tracks,
      });
    }
    return { collections: mapped };
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error({ err: error }, "queryMusicCollections failed");
    throw new AppError("unavailable", "MUSIC_PROVIDER_ERROR", 502);
  }
}

export async function queryLocalSounds(term = ""): Promise<LocalSoundRow[]> {
  const q = term.trim();
  const result = await getPool().query<LocalSoundRow>(
    `SELECT id, title, artist, audio_url, cover_url
     FROM sounds
     WHERE ($1 = '' OR title ILIKE $2 OR artist ILIKE $2)
     ORDER BY created_at DESC
     LIMIT 40`,
    [q, `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`],
  );
  return result.rows;
}

export async function queryMusicSearch(term: string): Promise<{
  configured: boolean;
  tracks: MusicTrack[];
}> {
  const q = term.trim();
  if (!q) {
    throw new AppError("invalid_argument", "term is required", 400);
  }
  if (!isEpidemicConfigured()) {
    throw new AppError("unavailable", "MUSIC_PROVIDER_NOT_CONFIGURED", 503);
  }
  try {
    const found = await searchEpidemicTracks(q, { limit: 40, offset: 0 });
    const tracks = await Promise.all(found.tracks.map(licensedTrack));
    return { configured: true, tracks };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("unavailable", "Music catalog is unavailable", 502);
  }
}

export async function queryMusicPreview(trackId: string): Promise<{ url: string; configured: boolean }> {
  const id = trackId.trim();
  if (!id) throw new AppError("invalid_argument", "trackId is required", 400);

  const local = await getPool().query<{ audio_url: string }>(
    `SELECT audio_url FROM sounds WHERE id = $1`,
    [id],
  );
  if (local.rows[0]?.audio_url) {
    return { url: local.rows[0].audio_url, configured: true };
  }

  if (!isEpidemicConfigured()) {
    throw new AppError("not_found", "Track not found", 404);
  }

  try {
    const preview = await resolveEpidemicPreviewUrl(id);
    if (!preview.url) throw new AppError("unavailable", "MUSIC_PREVIEW_UNAVAILABLE", 502);
    return { url: preview.url, configured: true };
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/404|not found|Non-UUID/i.test(message)) {
      throw new AppError("not_found", "Track not found", 404);
    }
    throw new AppError("unavailable", "MUSIC_PREVIEW_UNAVAILABLE", 502);
  }
}
