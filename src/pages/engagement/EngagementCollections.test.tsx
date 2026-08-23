import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import type {
  EngagementCreatorCardsResponse,
  EngagementStickersResponse,
  EngagementTreasureResponse,
} from "@shared/contracts";
import EngagementCollections from "./EngagementCollections";

const api = vi.hoisted(() => ({
  apiEngagementTreasure: vi.fn(),
  apiEngagementStickers: vi.fn(),
  apiEngagementCreatorCards: vi.fn(),
  apiEngagementTreasureOpen: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
const checkUser = vi.hoisted(() => vi.fn(async () => undefined));
const auth = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  checkUser: () => checkUser(),
}));

vi.mock("@/features/engagement/engagementCollectionsApi", () => api);
vi.mock("@/lib/toast", () => ({ showToast: (...args: unknown[]) => toast(...args) }));
vi.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector?: (state: typeof auth) => unknown) => (selector ? selector(auth) : auth);
  useAuthStore.getState = () => auth;
  return { useAuthStore };
});

const treasure = (chests: EngagementTreasureResponse["chests"] = []): EngagementTreasureResponse => ({
  catalog: [
    {
      id: "chest_common_watch",
      rarity: "common",
      title: "Watch Chest",
      description: "",
      reward_xp: 50,
      reward_promo_coins: 25,
      reward_energy: 10,
      reward_label: "50 XP + 25 Promo",
    },
  ],
  chests,
});

const stickers = (progress = 0): EngagementStickersResponse => ({
  sets: [
    {
      id: "animals",
      title: "Animals",
      theme: "Wildlife",
      complete_reward_label: "Animal frame",
      progress,
      total: 4,
      complete: progress >= 4,
      stickers: [],
    },
  ],
});

const cards = (): EngagementCreatorCardsResponse => ({
  tiers: [{ tier: "bronze", title: "Bronze Creator Card", stars: 2, watch_minutes_required: 5, gifts_required: 0 }],
  unlocked: [],
  progress: [],
});

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}`}</div>;
}

function renderPage(entry: string | { pathname: string; state?: unknown } = "/engagement/collections") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}>
        <Routes>
          <Route path="/engagement/collections" element={<EngagementCollections />} />
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

describe("PAGE-054 Collections", () => {
  beforeEach(() => {
    api.apiEngagementTreasure.mockReset();
    api.apiEngagementStickers.mockReset();
    api.apiEngagementCreatorCards.mockReset();
    api.apiEngagementTreasureOpen.mockReset();
    toast.mockReset();
    checkUser.mockReset();
    auth.user = { id: "11111111-1111-4111-8111-111111111111" };
    api.apiEngagementTreasure.mockResolvedValue({ ok: true, treasure: treasure() });
    api.apiEngagementStickers.mockResolvedValue({ ok: true, stickers: stickers() });
    api.apiEngagementCreatorCards.mockResolvedValue({ ok: true, cards: cards() });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("shows loading without empty collection copy", async () => {
    const hold = new Promise<{ ok: true; treasure: EngagementTreasureResponse }>(() => undefined);
    api.apiEngagementTreasure.mockReturnValueOnce(hold);
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain("Loading...");
    expect(container.textContent).not.toContain("No chests yet");
    expect(container.textContent).not.toContain("No sticker sets yet");
    expect(container.textContent).not.toContain("Watch creators on LIVE");
  });

  it("renders Treasure, Stickers, and Creator Cards from server inventory", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Treasure Hunt"));
    expect(container.textContent).toContain("Collections");
    expect(container.textContent).toContain("Stickers");
    expect(container.textContent).toContain("Creator Cards");
    expect(container.textContent).toContain("Animals");
    expect(container.textContent).toContain("0/4");
    expect(container.textContent).toContain("No chests yet. Watch LIVE to find them.");
    expect(container.textContent).toContain("Watch creators on LIVE to unlock cards.");
    expect(container.textContent).not.toContain("Saved videos");
  });

  it("shows an honest error instead of empty inventory", async () => {
    api.apiEngagementTreasure.mockResolvedValueOnce({
      ok: false,
      error: "Could not load collections",
      sessionExpired: false,
      disabled: false,
    });
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Could not load collections"));
    expect(container.textContent).not.toContain("No chests yet");
    expect(container.textContent).not.toContain("Treasure Hunt");
  });

  it("closes to Engagement Hub on named and hardware back", async () => {
    const view = renderPage({ pathname: "/engagement/collections", state: { returnTo: "/engagement" } });
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean(container!.querySelector('button[aria-label="Close"]')));
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /engagement");
    expect(namedHardwareBackTarget("/engagement/collections")).toBe("/engagement");
  });
});
