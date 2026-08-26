import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { returnToFromLocationState } from "@/lib/settingsNav";

const api = vi.hoisted(() => ({
  apiGetChatThread: vi.fn(),
  apiFetchThreadMessages: vi.fn(),
  apiMarkThreadRead: vi.fn(),
  apiSendThreadMessage: vi.fn(),
  startOutgoingCall: vi.fn(),
  wsOn: vi.fn(),
  wsOff: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/lib/wsClient", () => ({
  wsClient: {
    on: (...args: unknown[]) => api.wsOn(...args),
    off: (...args: unknown[]) => api.wsOff(...args),
  },
}));
vi.mock("@/features/chat/chatApi", async () => {
  const actual = await vi.importActual<typeof import("@/features/chat/chatApi")>("@/features/chat/chatApi");
  return {
    ...actual,
    apiGetChatThread: (...args: unknown[]) => api.apiGetChatThread(...args),
    apiFetchThreadMessages: (...args: unknown[]) => api.apiFetchThreadMessages(...args),
    apiMarkThreadRead: (...args: unknown[]) => api.apiMarkThreadRead(...args),
    apiSendThreadMessage: (...args: unknown[]) => api.apiSendThreadMessage(...args),
  };
});
vi.mock("@/features/calls/videoCallSession", () => ({
  startOutgoingCall: (...args: unknown[]) => api.startOutgoingCall(...args),
}));
vi.mock("@/features/feed/feedApi", () => ({
  apiLiveStreams: vi.fn(async () => ({ streams: [], error: null })),
  apiFetchProfile: vi.fn(async () => ({ profile: null, error: null })),
  apiFetchVideoById: vi.fn(async () => ({ video: null, error: null })),
}));
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (selector?: (state: { user: { id: string; displayName: string; username: string; avatarUrl: string } }) => unknown) => {
    const state = {
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        displayName: "Me",
        username: "me",
        avatarUrl: "",
      },
    };
    return selector ? selector(state) : state;
  },
}));

import ChatThread from "./ChatThread";

const threadId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherId = "22222222-2222-4222-8222-222222222222";

function LocationProbe() {
  const location = useLocation();
  const returnTo = returnToFromLocationState(location.state);
  return <div>{`LOC ${location.pathname}${returnTo ? ` RT ${returnTo}` : ""}`}</div>;
}

function renderThread() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[`/inbox/${threadId}`]}>
        <Routes>
          <Route path="/inbox/:threadId" element={<ChatThread />} />
          <Route path="/inbox" element={<LocationProbe />} />
          <Route path="/profile/:userId" element={<LocationProbe />} />
          <Route path="/call" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  api.apiGetChatThread.mockResolvedValue({
    thread: {
      id: threadId,
      otherUserId: otherId,
      otherUsername: "peer",
      otherDisplayName: "Peer",
      otherAvatarUrl: null,
      otherLevel: 1,
      blocked: false,
      otherUnavailable: false,
      canSend: true,
    },
    error: null,
  });
  api.apiFetchThreadMessages.mockResolvedValue({ messages: [], error: null });
  api.apiMarkThreadRead.mockResolvedValue({ ok: true });
  api.apiSendThreadMessage.mockResolvedValue({ message: null, error: null });
  api.startOutgoingCall.mockReturnValue({ ok: true });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("PAGE-033 Chat Thread page", () => {
  it("shows empty copy, closes to Inbox, and hands profile to PAGE-025", async () => {
    const view = renderThread();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Start the conversation!");
    expect(container.textContent).toContain("Peer");
    expect(container.querySelector('[aria-label="Back to inbox"]')).toBeTruthy();
    expect(container.querySelector('[placeholder="Type a message..."]')).toBeTruthy();
    expect(api.wsOn).toHaveBeenCalledWith("dm_message", expect.any(Function));
    expect(api.apiMarkThreadRead).toHaveBeenCalledWith(threadId);

    act(() => {
      container?.querySelector<HTMLButtonElement>('[aria-label="Back to inbox"]')?.click();
    });
    expect(container.textContent).toContain("LOC /inbox");

    const again = renderThread();
    root = again.root;
    container = again.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      container?.querySelector<HTMLButtonElement>('[aria-label="Open Peer\'s profile"]')?.click();
    });
    expect(container.textContent).toContain(`LOC /profile/${otherId}`);
    expect(container.textContent).toContain("RT /inbox");
  });

  it("hands the canonical thread to PAGE-034 and opens /call", async () => {
    const view = renderThread();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      container?.querySelector<HTMLButtonElement>('[aria-label="Video call"]')?.click();
    });
    expect(api.startOutgoingCall).toHaveBeenCalledWith({
      threadId,
      calleeId: otherId,
      remoteUser: { id: otherId, username: "Peer", avatar: "" },
    });
    expect(container.textContent).toContain("LOC /call");
  });

  it("shows load failure instead of empty conversation copy", async () => {
    api.apiGetChatThread.mockResolvedValue({ thread: null, error: "offline" });
    const view = renderThread();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("offline");
    expect(container.textContent).not.toContain("Start the conversation!");
  });

  it("disables send and blocks video call when thread is blocked", async () => {
    api.apiGetChatThread.mockResolvedValue({
      thread: {
        id: threadId,
        otherUserId: otherId,
        otherUsername: "peer",
        otherDisplayName: "Peer",
        otherAvatarUrl: null,
        otherLevel: 1,
        blocked: true,
        otherUnavailable: false,
        canSend: false,
      },
      error: null,
    });
    const view = renderThread();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const sendButton = container.querySelector<HTMLButtonElement>('[aria-label="Send message"]');
    expect(sendButton?.disabled).toBe(true);
    act(() => {
      container?.querySelector<HTMLButtonElement>('[aria-label="Video call"]')?.click();
    });
    expect(api.startOutgoingCall).not.toHaveBeenCalled();
  });
});
