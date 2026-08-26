/**
 * Cross-page save/like invalidation bus — Saved Videos, feeds, and Video View
 * subscribe so UI lists refresh after a canonical Neon save/unsave. Not authority.
 */
export type VideoCollectionEvent =
  | { type: "saved"; videoId: string; saved: boolean }
  | { type: "liked"; videoId: string; liked: boolean }
  | { type: "refresh"; collection: "saved" | "liked" | "all" };

type Listener = (event: VideoCollectionEvent) => void;

const listeners = new Set<Listener>();

export function subscribeVideoCollection(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishVideoCollection(event: VideoCollectionEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      /* ignore subscriber errors */
    }
  }
}
