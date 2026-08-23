import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import type { EngagementMvpResponse } from "@shared/contracts";
import EngagementMvp from "./EngagementMvp";

const api = vi.hoisted(() => ({
  apiEngagementMvp: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
const checkUser = vi.hoisted(() => vi.fn(async () => undefined));
const auth = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  checkUser: () => checkUser(),
}));

vi.mock("@/features/engagement/engagementMvpApi", () => api);
vi.mock("@/lib/toast", () => ({ showToast: (...args: unknown[]) => toast(...args) }));
vi.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector?: (state: typeof auth) => unknown) => (selector ? selector(auth) : auth);
  useAuthStore.getState = () => auth;
  return { useAuthStore };
});

const board = (patch: Partial<EngagementMvpResponse> = {}): EngagementMvpResponse => ({
  period: "today",
  viewer_id: "11111111-1111-4111-8111-111111111111",
  leaderboard: [
    { rank: 1, user_id: "11111111-1111-4111-8111-111111111111", points: 40 },
    { rank: 2, user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", points: 12 },
  ],
  ...patch,
});

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}`}</div>;
}

function renderPage(entry: string | { pathname: string; state?: unknown } = "/engagement/mvp") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}>
        <Routes>
          <Route path="/engagement/mvp" element={<EngagementMvp />} />
          <Route path="/engagement" element={<LocationProbe />} />
          <Route path="/settings" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

async function waitUntil(predicate: () => boolean, timeout = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error("waitUntil timeout");
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-050 MVP", () => {
  beforeEach(() => {
    api.apiEngagementMvp.mockReset();
    toast.mockReset();
    checkUser.mockReset();
    auth.user = { id: "11111111-1111-4111-8111-111111111111" };
    api.apiEngagementMvp.mockResolvedValue({ ok: true, board: board() });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("shows loading without flashing zero scores", async () => {
    const hold = new Promise<{ ok: true; board: EngagementMvpResponse }>(() => undefined);
    api.apiEngagementMvp.mockReturnValueOnce(hold);
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain("Loading...");
    expect(container.textContent).not.toContain("No MVP scores yet.");
    expect(container.textContent).not.toContain("#1");
  });

  it("renders ranks, You, and period tabs from the server board", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("#1"));
    expect(container.textContent).toContain("You");
    expect(container.textContent).toContain("40");
    expect(container.textContent).toContain("Today");
    expect(container.textContent).toContain("Week");
    expect(container.textContent).toContain("All");
    expect(container.textContent).toContain("Battle Energy boosts Fan Energy separately");
  });

  it("shows an honest error instead of zero scores", async () => {
    api.apiEngagementMvp.mockResolvedValueOnce({
      ok: false,
      error: "Could not load MVP board",
      sessionExpired: false,
      disabled: false,
    });
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Could not load MVP board"));
    expect(container.textContent).not.toContain("No MVP scores yet.");
    expect(container.textContent).not.toContain("#1");
  });

  it("shows the real empty board after a successful zero response", async () => {
    api.apiEngagementMvp.mockResolvedValueOnce({ ok: true, board: board({ leaderboard: [] }) });
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("No MVP scores yet."));
    expect(container.textContent).not.toContain("Could not load MVP board");
  });

  it("closes to Engagement Hub on named and hardware back", async () => {
    const view = renderPage({ pathname: "/engagement/mvp", state: { returnTo: "/engagement" } });
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean(container!.querySelector('button[aria-label="Close"]')));
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /engagement");
    expect(namedHardwareBackTarget("/engagement/mvp")).toBe("/engagement");
  });
});
