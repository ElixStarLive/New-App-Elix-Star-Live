import type { ChatMessage, ChatThreadDetail } from "./chatApi";
import { apiFetchThreadMessages, apiGetChatThread, apiMarkThreadRead, apiSendThreadMessage } from "./chatApi";
import { mergeThreadMessages, parseIncomingDm } from "./chatThreadMerge";

export type ChatThreadPhase = "idle" | "loading" | "ready" | "error";

export type ChatThreadSnapshot = {
  phase: ChatThreadPhase;
  viewerId: string;
  threadId: string;
  messages: ChatMessage[];
  thread: ChatThreadDetail | null;
  draft: string;
  sending: boolean;
  error: string | null;
  markError: string | null;
  sendError: string | null;
};

type Listener = () => void;

const empty: ChatThreadSnapshot = {
  phase: "idle",
  viewerId: "",
  threadId: "",
  messages: [],
  thread: null,
  draft: "",
  sending: false,
  error: null,
  markError: null,
  sendError: null,
};

export function createChatThreadSession() {
  let phase: ChatThreadPhase = "idle";
  let viewerId = "";
  let threadId = "";
  let messages: ChatMessage[] = [];
  let thread: ChatThreadDetail | null = null;
  let draft = "";
  let sending = false;
  let error: string | null = null;
  let markError: string | null = null;
  let sendError: string | null = null;
  let loadGen = 0;
  let markBusy = false;
  const listeners = new Set<Listener>();
  let cached: ChatThreadSnapshot = { ...empty };

  const snapshot = (): ChatThreadSnapshot => cached;

  const notify = () => {
    cached = {
      phase,
      viewerId,
      threadId,
      messages,
      thread,
      draft,
      sending,
      error,
      markError,
      sendError,
    };
    for (const fn of listeners) fn();
  };

  const resetComposer = () => {
    draft = "";
    sending = false;
    sendError = null;
  };

  const markRead = async (gen: number) => {
    if (!threadId) return;
    if (markBusy) return;
    markBusy = true;
    const marked = await apiMarkThreadRead(threadId);
    markBusy = false;
    if (gen !== loadGen) return;
    if (!marked.ok) {
      markError = marked.error;
      notify();
    }
  };

  return {
    subscribe(fn: Listener) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getSnapshot: snapshot,
    setDraft(next: string) {
      draft = next;
      notify();
    },
    async open(nextViewerId: string, nextThreadId: string) {
      const gen = ++loadGen;
      const switched = viewerId !== nextViewerId || threadId !== nextThreadId;
      viewerId = nextViewerId;
      threadId = nextThreadId;
      phase = "loading";
      error = null;
      markError = null;
      sendError = null;
      if (switched) {
        messages = [];
        thread = null;
        resetComposer();
      }
      notify();
      const [meta, history] = await Promise.all([
        apiGetChatThread(nextThreadId),
        apiFetchThreadMessages(nextThreadId),
      ]);
      if (gen !== loadGen) return;
      if (meta.error || !meta.thread) {
        error = meta.error || "Thread was not found";
        thread = null;
        if (messages.length === 0) phase = "error";
        else phase = "ready";
        notify();
        return;
      }
      thread = meta.thread;
      if (history.error) {
        error = history.error;
        phase = messages.length === 0 ? "error" : "ready";
        notify();
        return;
      }
      messages = mergeThreadMessages([], history.messages, nextThreadId);
      error = null;
      phase = "ready";
      notify();
      await markRead(gen);
    },
    async reconcile() {
      if (!(threadId && viewerId)) return;
      const gen = loadGen;
      const history = await apiFetchThreadMessages(threadId);
      if (gen !== loadGen) return;
      if (history.error) {
        error = history.error;
        notify();
        return;
      }
      messages = mergeThreadMessages(messages, history.messages, threadId);
      error = null;
      if (phase === "error" && messages.length > 0) phase = "ready";
      notify();
    },
    applyDmMessage(data: unknown) {
      if (!threadId) return;
      const incoming = parseIncomingDm(data, threadId);
      if (!incoming) return;
      messages = mergeThreadMessages(messages, [incoming], threadId);
      notify();
      void markRead(loadGen);
    },
    async send() {
      const text = draft.trim();
      if (!(threadId && viewerId && text) || sending) return;
      const gen = loadGen;
      const requestId = crypto.randomUUID();
      sending = true;
      sendError = null;
      draft = "";
      notify();
      const sent = await apiSendThreadMessage(threadId, text, requestId);
      if (gen !== loadGen) return;
      sending = false;
      if (sent.error || !sent.message) {
        draft = text;
        sendError = sent.error || "Could not send";
        notify();
        return;
      }
      messages = mergeThreadMessages(messages, [sent.message], threadId);
      sendError = null;
      notify();
    },
    dispose() {
      loadGen += 1;
      markBusy = false;
      phase = "idle";
      viewerId = "";
      threadId = "";
      messages = [];
      thread = null;
      resetComposer();
      error = null;
      markError = null;
      notify();
    },
  };
}

export type ChatThreadSession = ReturnType<typeof createChatThreadSession>;
export { empty as emptyChatThreadSnapshot };
