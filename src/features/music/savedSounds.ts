import type { MusicTrack } from "./musicApi";

const STORAGE_KEY = "music_saved_v1";

function readSaved(): MusicTrack[] {
  if (typeof localStorage === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }
    return parsed.filter((row): row is MusicTrack => {
      return Boolean(row && typeof row === "object" && typeof (row as MusicTrack).id === "string");
    });
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

export function isMusicTrackSaved(trackId: string): boolean {
  return readSaved().some((track) => track.id === trackId);
}

/** Returns true when the track is saved after the toggle. */
export function toggleSavedMusicTrack(track: MusicTrack): boolean {
  const prev = readSaved();
  const exists = prev.some((row) => row.id === track.id);
  const next = exists ? prev.filter((row) => row.id !== track.id) : [...prev, track];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return !exists;
}
