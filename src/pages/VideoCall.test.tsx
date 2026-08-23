import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCallStore } from "@/store/useCallStore";

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/lib/livekitSession", () => ({
  LiveKitSession: class {
    connect = vi.fn();
    disconnect = vi.fn();
    publishFromStream = vi.fn();
  },
}));
vi.mock("@/features/calls/callToken", () => ({
  apiFetchCallToken: vi.fn(async () => ({ creds: null, error: "no media in unit test" })),
}));
vi.mock("@/lib/wsClient", () => ({
  wsClient: { send: vi.fn(), on: vi.fn(), off: vi.fn() },
}));

import VideoCall from "./VideoCall";

const callerId = "11111111-1111-4111-8111-111111111111";
const calleeId = "22222222-2222-4222-8222-222222222222";
const threadId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const callId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function renderCall() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter>
        <VideoCall />
      </MemoryRouter>,
    );
  });
  return { container, root };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  useCallStore.getState().reset();
  useCallStore.setState({ viewerId: calleeId, threadId: null });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [],
        getAudioTracks: () => [],
        getVideoTracks: () => [],
      })),
    },
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  useCallStore.getState().reset();
});

describe("PAGE-034 Video Call page", () => {
  it("shows the empty state and hides Accept when outgoing", async () => {
    const empty = renderCall();
    root = empty.root;
    container = empty.container;
    expect(container.textContent).toContain("No active call");

    act(() => {
      empty.root.unmount();
    });
    useCallStore.setState({
      callId,
      status: "outgoing",
      remoteUser: { id: calleeId, username: "Peer", avatar: null },
      callerId,
      calleeId,
      threadId,
      roomName: `call_${callId}`,
    });
    const outgoing = renderCall();
    root = outgoing.root;
    container = outgoing.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Peer");
    expect(container.textContent).toContain("Calling...");
    expect(container.querySelector('[aria-label="Accept call"]')).toBeNull();
    const end = container.querySelector<HTMLButtonElement>('[aria-label="End call"]');
    expect(end?.className).toContain("bg-[#EF4444]");
    expect(container.innerHTML).toContain("top-20 right-4 w-28 h-40 rounded-2xl");
  });

  it("shows green Accept only for incoming", () => {
    useCallStore.setState({
      callId,
      status: "incoming",
      remoteUser: { id: callerId, username: "Maya", avatar: null },
      callerId,
      calleeId,
      threadId,
      roomName: `call_${callId}`,
    });
    const view = renderCall();
    root = view.root;
    container = view.container;
    const accept = container.querySelector<HTMLButtonElement>('[aria-label="Accept call"]');
    expect(accept).toBeTruthy();
    expect(accept?.className).toContain("bg-[#22C55E]");
    expect(container.textContent).toContain("Incoming call...");
  });
});
