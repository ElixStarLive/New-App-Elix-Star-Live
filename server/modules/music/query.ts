import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import {
  fetchEpidemicCollections,
  fetchEpidemicHighlights,
  isEpidemicConfigured,
  resolveEpidemicPreviewUrl,
  searchEpidemicTracks,
  type EpidemicTrack,
} from "./epidemic.js";

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

export async function queryMusicPlaylists(): Promise<{
  playlists: MusicPlaylist[];
  configured: boolean;
  clipMaxSeconds: number;
}> {
  if (!isEpidemicConfigured()) {
    return { playlists: [], configured: false, clipMaxSeconds: LICENSED_CLIP_MAX_SECONDS };
  }
  try {
    const collections = await fetchEpidemicCollections(10, 0);
    const playlists: MusicPlaylist[] = [];
    for (const collection of collections) {
      if (collection.tracks.length === 0) continue;
      const tracks = await Promise.all(collection.tracks.slice(0, 30).map(licensedTrack));
      playlists.push({
        id: collection.id || tracks[0]?.id || collection.name,
        name: collection.name,
        coverUrl: collection.coverUrl || tracks[0]?.coverUrl || null,
        tracks,
      });
    }
    return { playlists, configured: true, clipMaxSeconds: LICENSED_CLIP_MAX_SECONDS };
  } catch {
    throw new AppError("unavailable", "Music playlists are unavailable", 502);
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
    if (!preview.url) throw new AppError("not_found", "Preview is not available", 404);
    return { url: preview.url, configured: true };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("not_found", "Track not found", 404);
  }
}
