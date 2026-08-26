/**
 * Valkey cache for Epidemic Sound catalog + expiring preview URLs.
 * Catalog authority remains the provider; Neon owns local `sounds` rows only.
 */
export const MUSIC_CACHE_TTL_MS = {
  collections: 6 * 60 * 60 * 1000,
  search: 60 * 60 * 1000,
  highlights: 24 * 60 * 60 * 1000,
  picker: 2 * 60 * 60 * 1000,
  metadata: 24 * 60 * 60 * 1000,
  globalPlaylist: 2 * 60 * 60 * 1000,
  playlistsBundle: 2 * 60 * 60 * 1000,
  preview: 60 * 60 * 1000,
} as const;

export function musicCacheKey(kind: string, id: string): string {
  return `elix:music:${kind}:${id}`;
}

export function previewCacheKey(trackId: string): string {
  return `elix:music:preview:v2:${trackId}`;
}
