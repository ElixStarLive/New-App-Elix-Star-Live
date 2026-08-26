import { isRecord } from "@/lib/isRecord";
import { apiRequest } from "@/lib/apiClient";

export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  duration: string;
  coverUrl: string | null;
  clipStartSeconds: number;
  clipEndSeconds: number;
};

export type MusicPlaylist = {
  id: string;
  name: string;
  coverUrl: string | null;
  tracks: MusicTrack[];
};

function parseTrack(raw: unknown): MusicTrack | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id.trim()) return null;
  const start = Number(raw.clipStartSeconds ?? 0);
  const end = Number(raw.clipEndSeconds ?? 0);
  return {
    id: raw.id,
    title: typeof raw.title === "string" && raw.title ? raw.title : "Sound",
    artist: typeof raw.artist === "string" ? raw.artist : "",
    duration: typeof raw.duration === "string" ? raw.duration : "",
    coverUrl: typeof raw.coverUrl === "string" ? raw.coverUrl : null,
    clipStartSeconds: Number.isFinite(start) ? Math.max(0, start) : 0,
    clipEndSeconds: Number.isFinite(end) ? Math.max(0, end) : 0,
  };
}

export async function apiFetchMusicPlaylists(): Promise<{
  playlists: MusicPlaylist[];
  configured: boolean;
  error: string | null;
  status?: number;
}> {
  const { data, error } = await apiRequest<unknown>("/api/music/playlists");
  if (error) {
    return { playlists: [], configured: false, error: error.message, status: error.status };
  }
  if (!isRecord(data) || !Array.isArray(data.playlists)) {
    return { playlists: [], configured: false, error: "Invalid music playlists" };
  }
  const playlists: MusicPlaylist[] = [];
  for (const raw of data.playlists) {
    if (!isRecord(raw) || typeof raw.id !== "string") continue;
    const tracks: MusicTrack[] = [];
    if (Array.isArray(raw.tracks)) {
      for (const row of raw.tracks) {
        const track = parseTrack(row);
        if (track) tracks.push(track);
      }
    }
    playlists.push({
      id: raw.id,
      name: typeof raw.name === "string" && raw.name ? raw.name : "Playlist",
      coverUrl: typeof raw.coverUrl === "string" ? raw.coverUrl : null,
      tracks,
    });
  }
  return { playlists, configured: data.configured === true, error: null };
}

export async function apiSearchMusicTracks(term: string): Promise<{
  tracks: MusicTrack[];
  error: string | null;
  status?: number;
}> {
  const q = term.trim();
  const { data, error } = await apiRequest<unknown>(
    q
      ? `/api/music/search?term=${encodeURIComponent(q)}&limit=40`
      : `/api/music/search`,
  );
  if (error) return { tracks: [], error: error.message, status: error.status };
  if (!isRecord(data)) return { tracks: [], error: "Invalid music search" };

  const tracks: MusicTrack[] = [];
  if (!Array.isArray(data.tracks)) {
    return { tracks: [], error: "Invalid music search" };
  }
  for (const row of data.tracks) {
    const track = parseTrack(row);
    if (track) tracks.push(track);
  }
  return { tracks, error: null };
}

export async function apiMusicTrackPreview(trackId: string): Promise<{
  url: string | null;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>(
    `/api/music/tracks/${encodeURIComponent(trackId)}/preview`,
  );
  if (error) return { url: null, error: error.message };
  if (!isRecord(data) || typeof data.url !== "string" || !data.url) {
    return { url: null, error: "Preview is not available" };
  }
  return { url: data.url, error: null };
}

export async function apiFetchMusicStatus(): Promise<{
  configured: boolean;
  provider: string | null;
  error: string | null;
}> {
  const { data, error } = await apiRequest<unknown>("/api/music/status");
  if (error) return { configured: false, provider: null, error: error.message };
  if (!isRecord(data)) return { configured: false, provider: null, error: "Invalid music status" };
  return {
    configured: data.configured === true,
    provider: typeof data.provider === "string" ? data.provider : null,
    error: null,
  };
}

export async function apiFetchMusicGlobal(): Promise<{
  playlist: MusicPlaylist | null;
  configured: boolean;
  error: string | null;
  status?: number;
}> {
  const { data, error } = await apiRequest<unknown>("/api/music/global");
  if (error) {
    return { playlist: null, configured: false, error: error.message, status: error.status };
  }
  if (!isRecord(data)) return { playlist: null, configured: false, error: "Invalid music global" };
  const raw = data.playlist;
  if (!raw || !isRecord(raw) || typeof raw.id !== "string") {
    return { playlist: null, configured: data.configured === true, error: null };
  }
  const tracks: MusicTrack[] = [];
  if (Array.isArray(raw.tracks)) {
    for (const row of raw.tracks) {
      const track = parseTrack(row);
      if (track) tracks.push(track);
    }
  }
  return {
    playlist: {
      id: raw.id,
      name: typeof raw.name === "string" && raw.name ? raw.name : "For You",
      coverUrl: typeof raw.coverUrl === "string" ? raw.coverUrl : null,
      tracks,
    },
    configured: data.configured === true,
    error: null,
  };
}

export async function apiFetchMusicCollections(): Promise<{
  collections: MusicPlaylist[];
  error: string | null;
  status?: number;
}> {
  const { data, error } = await apiRequest<unknown>("/api/music/collections");
  if (error) return { collections: [], error: error.message, status: error.status };
  if (!isRecord(data) || !Array.isArray(data.collections)) {
    return { collections: [], error: "Invalid music collections" };
  }
  const collections: MusicPlaylist[] = [];
  for (const raw of data.collections) {
    if (!isRecord(raw) || typeof raw.id !== "string") continue;
    const tracks: MusicTrack[] = [];
    if (Array.isArray(raw.tracks)) {
      for (const row of raw.tracks) {
        const track = parseTrack(row);
        if (track) tracks.push(track);
      }
    }
    collections.push({
      id: raw.id,
      name: typeof raw.name === "string" && raw.name ? raw.name : "Collection",
      coverUrl: typeof raw.coverUrl === "string" ? raw.coverUrl : null,
      tracks,
    });
  }
  return { collections, error: null };
}
