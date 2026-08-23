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
  if (Array.isArray(data.tracks)) {
    for (const row of data.tracks) {
      const track = parseTrack(row);
      if (track) tracks.push(track);
    }
  }
  // Empty-term (and unconfigured) responses expose local Neon `sounds` as `items`.
  if (tracks.length === 0 && Array.isArray(data.items)) {
    for (const row of data.items) {
      if (!isRecord(row) || typeof row.id !== "string" || !row.id.trim()) continue;
      tracks.push({
        id: row.id,
        title: typeof row.title === "string" && row.title ? row.title : "Sound",
        artist: typeof row.artist === "string" ? row.artist : "",
        duration: "",
        coverUrl: typeof row.cover_url === "string" ? row.cover_url : typeof row.coverUrl === "string" ? row.coverUrl : null,
        clipStartSeconds: 0,
        clipEndSeconds: 60,
      });
    }
  }
  if (!Array.isArray(data.tracks) && !Array.isArray(data.items)) {
    return { tracks: [], error: "Invalid music search" };
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
