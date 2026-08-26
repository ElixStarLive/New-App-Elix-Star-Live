import { env } from "../../infra/env.js";
import { logger } from "../../infra/logger.js";
import { requireValkey, valkeyGet, valkeySet } from "../../infra/valkey.js";
import { MUSIC_CACHE_TTL_MS, musicCacheKey, previewCacheKey } from "./musicCache.js";

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

async function musicCacheGet(key: string): Promise<string | null> {
  if (!env().valkeyUrl) return null;
  try {
    return await valkeyGet(key);
  } catch (error) {
    logger.warn({ err: error, key }, "music cache read failed");
    return null;
  }
}

async function musicCacheSet(key: string, value: string, ttlMs: number): Promise<void> {
  if (!env().valkeyUrl) return;
  try {
    await valkeySet(key, value, ttlMs);
  } catch (error) {
    logger.warn({ err: error, key }, "music cache write failed");
  }
}

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
  const cacheKey = musicCacheKey("collections", `${limit}:${offset}`);
  const cached = await musicCacheGet(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as EpidemicCollection[];
    } catch {
      /* refetch */
    }
  }

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
  await musicCacheSet(cacheKey, JSON.stringify(collections), MUSIC_CACHE_TTL_MS.collections);
  return collections;
}

export async function searchEpidemicTracks(
  term: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ tracks: EpidemicTrack[] }> {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  const cacheKey = musicCacheKey("search", `${term.trim().toLowerCase()}:${limit}:${offset}`);
  const cached = await musicCacheGet(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as { tracks: EpidemicTrack[] };
    } catch {
      /* refetch */
    }
  }

  const qs = new URLSearchParams({
    term: term.trim(),
    limit: String(limit),
    offset: String(offset),
  });
  const data = await epidemicFetch<{ tracks?: Record<string, unknown>[] }>(`/v0/tracks/search?${qs}`);
  const body = {
    tracks: (data.tracks ?? []).map(mapEpidemicTrack).filter((track) => track.id),
  };
  await musicCacheSet(cacheKey, JSON.stringify(body), MUSIC_CACHE_TTL_MS.search);
  return body;
}

export async function fetchEpidemicHighlights(
  trackId: string,
  durationSec: number,
): Promise<{ fromMs: number; toMs: number }> {
  const cacheKey = musicCacheKey("highlights", `${trackId}:${durationSec}`);
  const cached = await musicCacheGet(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as { fromMs: number; toMs: number };
    } catch {
      /* refetch */
    }
  }

  const qs = new URLSearchParams({ duration: String(durationSec) });
  const data = await epidemicFetch<{ highlights?: Array<{ from?: number; to?: number }> }>(
    `/v0/tracks/${encodeURIComponent(trackId)}/highlights?${qs}`,
  );
  const first = data.highlights?.[0];
  const body = {
    fromMs: first?.from ?? 0,
    toMs: first?.to ?? durationSec * 1000,
  };
  await musicCacheSet(cacheKey, JSON.stringify(body), MUSIC_CACHE_TTL_MS.highlights);
  return body;
}

/** Curated picker list for the For You / global playlist. */
export async function fetchEpidemicPickerTracks(limit = 60): Promise<EpidemicTrack[]> {
  const cacheKey = musicCacheKey("picker", String(limit));
  const cached = await musicCacheGet(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as EpidemicTrack[];
    } catch {
      /* refetch */
    }
  }

  const tracks: EpidemicTrack[] = [];
  const seen = new Set<string>();

  try {
    const collections = await fetchEpidemicCollections(5, 0);
    for (const col of collections) {
      for (const mapped of col.tracks) {
        if (seen.has(mapped.id)) continue;
        seen.add(mapped.id);
        tracks.push(mapped);
        if (tracks.length >= limit) break;
      }
      if (tracks.length >= limit) break;
    }
  } catch (error) {
    logger.warn({ err: error }, "fetchEpidemicPickerTracks collections failed");
  }

  if (tracks.length < 10) {
    try {
      const { tracks: searched } = await searchEpidemicTracks("happy", { limit: 30, offset: 0 });
      for (const mapped of searched) {
        if (seen.has(mapped.id)) continue;
        seen.add(mapped.id);
        tracks.push(mapped);
        if (tracks.length >= limit) break;
      }
    } catch (error) {
      logger.warn({ err: error }, "fetchEpidemicPickerTracks search fallback failed");
    }
  }

  await musicCacheSet(cacheKey, JSON.stringify(tracks), MUSIC_CACHE_TTL_MS.picker);
  return tracks;
}

export async function resolveEpidemicPreviewUrl(
  trackId: string,
): Promise<{ url: string; format: "mp3" | "hls" }> {
  const cacheKey = previewCacheKey(trackId);
  const cached = await musicCacheGet(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { url?: string; format?: "mp3" | "hls" };
      if (typeof parsed.url === "string" && parsed.url) {
        return { url: parsed.url, format: parsed.format === "hls" ? "hls" : "mp3" };
      }
    } catch {
      /* refetch */
    }
  }

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
        const body = { url: data.url, format };
        await musicCacheSet(cacheKey, JSON.stringify(body), MUSIC_CACHE_TTL_MS.preview);
        return body;
      }
    } catch (error) {
      lastError = error;
      logger.warn({ err: error, trackId, path }, "Epidemic preview source failed");
    }
  }
  throw lastError instanceof Error ? lastError : new Error("MUSIC_PREVIEW_UNAVAILABLE");
}

/** Warm the Valkey client so music routes fail visibly when Valkey is required but down. */
export function musicValkeyReady(): boolean {
  if (!env().valkeyUrl) return false;
  try {
    requireValkey();
    return true;
  } catch {
    return false;
  }
}
