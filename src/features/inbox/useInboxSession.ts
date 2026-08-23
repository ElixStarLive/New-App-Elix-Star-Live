import { useSyncExternalStore } from "react";
import { createInboxSession, emptyInboxSnapshot, type InboxSession, type InboxSnapshot } from "./inboxSession";

export function useInboxSession(session: InboxSession): InboxSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, () => emptyInboxSnapshot);
}

export { createInboxSession };
