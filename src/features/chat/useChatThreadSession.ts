import { useSyncExternalStore } from "react";
import {
  createChatThreadSession,
  emptyChatThreadSnapshot,
  type ChatThreadSession,
  type ChatThreadSnapshot,
} from "./chatThreadSession";

export function useChatThreadSession(session: ChatThreadSession): ChatThreadSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, () => emptyChatThreadSnapshot);
}

export { createChatThreadSession };
