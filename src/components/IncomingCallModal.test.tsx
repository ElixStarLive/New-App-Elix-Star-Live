import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCallStore } from "@/store/useCallStore";

const send = vi.fn();

vi.mock("@/lib/wsClient", () => ({
  wsClient: {
    send: (...args: unknown[]) => send(...args),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

import { IncomingCallModal } from "./IncomingCallModal";

const callId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const callerId = "11111111-1111-4111-8111-111111111111";
const threadId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}`}</div>;
}

function renderModal(path = "/feed") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <IncomingCallModal />
        <Routes>
          <Route path="/feed" element={<LocationProbe />} />
          <Route path="/call" element={<LocationProbe />} />
          <Route path="/inbox" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  send.mockReset();
  useCallStore.getState().reset();
  useCallStore.setState({
    viewerId: "22222222-2222-4222-8222-222222222222",
    callId,
    status: "incoming",
    remoteUser: { id: callerId, username: "Maya", avatar: null },
    callerId,
    calleeId: "22222222-2222-4222-8222-222222222222",
    threadId,
    roomName: `call_${callId}`,
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

describe("PAGE-035 Incoming Call Modal", () => {
  it("shows OLD chrome over the current page and stays there on Decline", () => {
    const view = renderModal("/feed");
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain("Maya");
    expect(container.textContent).toContain("Incoming video call...");
    expect(container.textContent).toContain("LOC /feed");
    const decline = container.querySelector<HTMLButtonElement>('[aria-label="Decline call"]');
    const accept = container.querySelector<HTMLButtonElement>('[aria-label="Accept call"]');
    expect(decline?.className).toContain("bg-[#EF4444]");
    expect(accept?.className).toContain("bg-[#22C55E]");
    expect(container.querySelector(".elix-solid-red")).toBeTruthy();
    act(() => {
      decline?.click();
      decline?.click();
      decline?.click();
    });
    expect(send.mock.calls.filter((row) => row[0] === "call_rejected")).toHaveLength(1);
    expect(container.textContent).toContain("LOC /feed");
    expect(container.querySelector('[aria-label="Decline call"]')).toBeNull();
    expect(useCallStore.getState().status).toBe("idle");
  });

  it("Accepts once, hands off to /call, and ignores Decline after Accept", () => {
    const view = renderModal("/feed");
    root = view.root;
    container = view.container;
    const accept = container.querySelector<HTMLButtonElement>('[aria-label="Accept call"]');
    const decline = container.querySelector<HTMLButtonElement>('[aria-label="Decline call"]');
    act(() => {
      accept?.click();
      accept?.click();
      decline?.click();
    });
    expect(send.mock.calls.filter((row) => row[0] === "call_accepted")).toHaveLength(1);
    expect(send.mock.calls.filter((row) => row[0] === "call_rejected")).toHaveLength(0);
    expect(container.textContent).toContain("LOC /call");
    expect(useCallStore.getState().status).toBe("connecting");
    expect(useCallStore.getState().callId).toBe(callId);
    expect(useCallStore.getState().threadId).toBe(threadId);
  });

  it("does not render on /call and does not own LiveKit", () => {
    const view = renderModal("/call");
    root = view.root;
    container = view.container;
    expect(container.querySelector('[aria-label="Accept call"]')).toBeNull();
    expect(container.textContent).toContain("LOC /call");
  });
});
