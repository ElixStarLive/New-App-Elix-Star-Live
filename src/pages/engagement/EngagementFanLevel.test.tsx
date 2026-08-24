import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import type { EngagementFanLevel as Fan } from "@shared/contracts";
import EngagementFanLevel from "./EngagementFanLevel";

const api = vi.hoisted(() => ({
  apiEngagementFanLevel: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
const checkUser = vi.hoisted(() => vi.fn(async () => undefined));
const auth = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  checkUser: () => checkUser(),
}));

vi.mock("@/features/engagement/engagementFanLevelApi", () => api);
vi.mock("@/lib/toast", () => ({ showToast: (...args: unknown[]) => toast(...args) }));
vi.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector?: (state: typeof auth) => unknown) => (selector ? selector(auth) : auth);
  useAuthStore.getState = () => auth;
  return { useAuthStore };
});

const fan = (patch: Partial<Fan> = {}): Fan => ({
  level: 12,
  tier: "Silver Fan",
  total_xp: 4000,
  title: "Active Fan",
  badge_code: "active_fan",
  next_level_total_xp: 4500,
  xp_to_next_level: 500,
  ...patch,
});

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}`}</div>;
}

function renderPage(entry: string | { pathname: string; state?: unknown } = "/engagement/fan-level") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}>
        <Routes>
          <Route path="/engagement/fan-level" element={<EngagementFanLevel />} />
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

describe("PAGE-049 Fan Level", () => {
  beforeEach(() => {
    api.apiEngagementFanLevel.mockReset();
    toast.mockReset();
    checkUser.mockReset();
    auth.user = { id: "11111111-1111-4111-8111-111111111111" };
    api.apiEngagementFanLevel.mockResolvedValue({ ok: true, fanLevel: fan() });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("shows loading without flashing level 0", async () => {
    const hold = new Promise<{ ok: true; fanLevel: Fan }>(() => undefined);
    api.apiEngagementFanLevel.mockReturnValueOnce(hold);
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain("Loading...");
    expect(container.textContent).not.toContain("Level 0");
    expect(container.textContent).not.toContain("0 XP");
  });

  it("renders server tier, level, XP, and the shared ladder", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Silver Fan"));
    expect(container.textContent).toContain("Level 12");
    expect(container.textContent).toContain("4000 XP · 500 to next");
    expect(container.textContent).toContain("Bronze Fan");
    expect(container.textContent).toContain("Legend Fan");
    expect(container.textContent).toContain("Lv 10+");
  });

  it("shows an honest error instead of level 0", async () => {
    api.apiEngagementFanLevel.mockResolvedValueOnce({
      ok: false,
      error: "Could not load fan level",
      sessionExpired: false,
      disabled: false,
    });
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Could not load fan level"));
    expect(container.textContent).not.toContain("Level 0");
    expect(container.textContent).not.toContain("Tiers");
  });

  it("closes to Engagement Hub on named and hardware back", async () => {
    const view = renderPage({ pathname: "/engagement/fan-level", state: { returnTo: "/engagement" } });
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean(container!.querySelector('button[aria-label="Close"]')));
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /engagement");
    expect(namedHardwareBackTarget("/engagement/fan-level")).toBe("/engagement");
  });
});
