import { logger } from "../../infra/logger.js";

const DEFAULT_BASE = "https://partner-content-api.epidemicsound.com";

const KEY_ENV = ["EPIDEMIC_SOUND_API_KEY", "EPIDEMIC_API_KEY", "EPIDEMIC_SOUND_KEY"] as const;

function readSecret(raw: string | undefined): string {
  if (!raw) return "";
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  if (value.startsWith("Set ") && value.toLowerCase().includes("coolify")) return "";
  return value;
}

export function epidemicApiKey(): string {
  for (const name of KEY_ENV) {
    const value = readSecret(process.env[name]);
    if (value) return value;
  }
  return "";
}

export function isEpidemicConfigured(): boolean {
  return Boolean(epidemicApiKey());
}

function epidemicBase(): string {
  const fromEnv = process.env.EPIDEMIC_SOUND_API_BASE?.trim();
  return fromEnv || DEFAULT_BASE;
}

export type EpidemicTrack = {
  id: string;
  title: string;
  artist: string;
  lengthSeconds: number;
  coverUrl: string | null;
  isPreviewOnly: boolean;
};

export type EpidemicCollection = {
  id: string;
  name: string;
  coverUrl: string | null;
  tracks: EpidemicTrack[];
};

function artistLabel(main?: unknown, featured?: unknown): string {
  const mains = Array.isArray(main) ? main.filter((row) => typeof row === "string") : [];
  const feats = Array.isArray(featured) ? featured.filter((row) => typeof row === "string") : [];
  const left = mains.join(", ");
  const right = feats.join(", ");
  if (left && right) return `${left} ft. ${right}`;
  return left || right || "Epidemic Sound";
}

export function mapEpidemicTrack(raw: Record<string, unknown>): EpidemicTrack {
  const images = raw.images && typeof raw.images === "object" ? (raw.images as Record<string, unknown>) : {};
  const cover =
    (typeof images.default === "string" && images.default) ||
    (typeof images.S === "string" && images.S) ||
    null;
  return {
    id: String(raw.id ?? ""),
    title: typeof raw.title === "string" ? raw.title : "",
    artist: artistLabel(raw.mainArtists, raw.featuredArtists),
    lengthSeconds: Number(raw.length ?? 0) || 0,
    coverUrl: cover,
    isPreviewOnly: Boolean(raw.isPreviewOnly),
  };
}

async function epidemicFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const key = epidemicApiKey();
  if (!key) throw new Error("EPIDEMIC_SOUND_API_KEY not configured");
  const url = path.startsWith("http") ? path : `${epidemicBase()}${path}`;
  const response = await fetch(url, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(15_000),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { message?: string };
      if (typeof body.message === "string" && body.message) detail = body.message;
    } catch {
      /* keep status text */
    }
    throw new Error(`Epidemic Sound ${response.status}: ${detail}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function fetchEpidemicCollections(limit = 10, offset = 0): Promise<EpidemicCollection[]> {
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const data = await epidemicFetch<{ collections?: unknown[] }>(`/v0/collections?${qs}`);
  const collections: EpidemicCollection[] = [];
  for (const raw of data.collections ?? []) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const images = row.images && typeof row.images === "object" ? (row.images as Record<string, unknown>) : {};
    const tracks: EpidemicTrack[] = [];
    if (Array.isArray(row.tracks)) {
      for (const track of row.tracks) {
        if (track && typeof track === "object") {
          const mapped = mapEpidemicTrack(track as Record<string, unknown>);
          if (mapped.id) tracks.push(mapped);
        }
      }
    }
    collections.push({
      id: String(row.id ?? row.name ?? tracks[0]?.id ?? ""),
      name: typeof row.name === "string" && row.name ? row.name : "Playlist",
      coverUrl:
        (typeof images.default === "string" && images.default) ||
        (typeof images.S === "string" && images.S) ||
        tracks[0]?.coverUrl ||
        null,
      tracks,
    });
  }
  return collections;
}

export async function searchEpidemicTracks(
  term: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ tracks: EpidemicTrack[] }> {
  const qs = new URLSearchParams({
    term: term.trim(),
    limit: String(opts?.limit ?? 50),
    offset: String(opts?.offset ?? 0),
  });
  const data = await epidemicFetch<{ tracks?: Record<string, unknown>[] }>(`/v0/tracks/search?${qs}`);
  return {
    tracks: (data.tracks ?? []).map(mapEpidemicTrack).filter((track) => track.id),
  };
}

export async function fetchEpidemicHighlights(
  trackId: string,
  durationSec: number,
): Promise<{ fromMs: number; toMs: number }> {
  const qs = new URLSearchParams({ duration: String(durationSec) });
  const data = await epidemicFetch<{ highlights?: Array<{ from?: number; to?: number }> }>(
    `/v0/tracks/${encodeURIComponent(trackId)}/highlights?${qs}`,
  );
  const first = data.highlights?.[0];
  return {
    fromMs: first?.from ?? 0,
    toMs: first?.to ?? durationSec * 1000,
  };
}

export async function resolveEpidemicPreviewUrl(
  trackId: string,
): Promise<{ url: string; format: "mp3" | "hls" }> {
  const paths = [
    `/v0/tracks/${encodeURIComponent(trackId)}/download?quality=normal&format=mp3`,
    `/v0/tracks/${encodeURIComponent(trackId)}/stream`,
  ];
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      const data = await epidemicFetch<{ url?: string }>(path);
      if (typeof data.url === "string" && data.url) {
        const format: "mp3" | "hls" = /\.m3u8(\?|$)/i.test(data.url) ? "hls" : "mp3";
        return { url: data.url, format };
      }
    } catch (error) {
      lastError = error;
      logger.warn({ err: error, trackId, path }, "Epidemic preview source failed");
    }
  }
  throw lastError instanceof Error ? lastError : new Error("MUSIC_PREVIEW_UNAVAILABLE");
}
