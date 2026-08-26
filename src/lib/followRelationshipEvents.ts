/**
 * Cross-page follow relationship bus — Followers, Following, profiles, and feeds
 * subscribe after canonical Neon follow/unfollow. Not relationship authority.
 */
export type FollowRelationshipEvent = {
  type: "follow";
  targetId: string;
  following: boolean;
};

type Listener = (event: FollowRelationshipEvent) => void;

const listeners = new Set<Listener>();

export function subscribeFollowRelationship(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishFollowRelationship(event: FollowRelationshipEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      /* ignore subscriber errors */
    }
  }
}
