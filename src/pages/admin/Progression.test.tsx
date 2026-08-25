import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_PROGRESSION_BACK,
  ADMIN_PROGRESSION_ERROR,
  ADMIN_PROGRESSION_FLAGS_TITLE,
  ADMIN_PROGRESSION_LOADING,
  ADMIN_PROGRESSION_MISSIONS_TITLE,
  ADMIN_PROGRESSION_TITLE,
} from "@/content/adminProgression";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import AdminProgression from "./Progression";

const authState = vi.hoisted(() => ({
  user: { id: "admin-1", isAdmin: true } as { id: string; isAdmin: boolean } | null,
}));

const progressionApi = vi.hoisted(() => ({
  config: {
    config: [
      { source: "daily_activity", xpAmount: 10, enabled: true, description: "Eligible daily activity" },
    ],
    levels: [{ level: 1, totalXpRequired: 207, title: "New Supporter", badgeCode: "new_supporter" }],
    error: null as string | null,
  },
  engagement: {
    flags: { liveQuestsEnabled: false, engagementHubEnabled: true } as Record<string, boolean>,
    rows: [
      {
        key: "liveQuestsEnabled",
        effective: false,
        defaultValue: false,
        envValue: false,
        adminValue: null,
        lastChangedBy: null,
        lastChangedAt: null,
        reason: null,
      },
    ],
    missions: [
      {
        id: "daily_like",
        title: "<script>alert(1)</script>",
        goalCount: 5,
        rewardXp: 0,
        rewardPromoCoins: 10,
        rewardEnergy: 0,
        enabled: true,
        metricKey: "like",
        scope: "daily",
        audience: "all_authenticated",
        startsAt: null,
        endsAt: null,
        sortOrder: 2,
      },
    ],
    rewards: [{ streakDay: 1, rewardXp: 100, rewardPromoCoins: 0, rewardLabel: "100 XP" }],
    policy: {
      streakResetPolicy: "miss_one_day" as const,
      effectiveStart: "",
      effectiveEnd: "",
      active: true,
    },
    caps: {
      watchAmount: 5,
      commentAmount: 2,
      shareAmount: 20,
      watchCap: 300,
      commentCap: 20,
      shareCap: 1,
      storageCap: 10000,
      sessionCap: 500,
      dailyCap: 2000,
      minimumBoost: 1,
      allowedBoostValues: [1, 2, 5, 10],
      fanEnergyThreshold: 10000,
      scoreMultiplier: 1.2,
      boostDurationSec: 5,
      enabled: true,
    },
    entries: [
      {
        id: "1",
        adminUserId: "admin-1",
        action: "xp_config_update",
        target: "daily_activity",
        createdAt: "2026-08-22T00:00:00.000Z",
      },
    ],
    error: null as string | null,
  },
  pending: null as Promise<void> | null,
}));

const toast = vi.hoisted(() => vi.fn());

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: Object.assign((selector: (state: typeof authState) => unknown) => selector(authState), {
    getState: () => authState,
  }),
}));

vi.mock("@/features/admin/adminApi", () => ({
  apiAdminProgressionLoadConfig: async () => {
    if (progressionApi.pending) await progressionApi.pending;
    return progressionApi.config;
  },
  apiAdminProgressionLoadEngagementAdmin: async () => {
    if (progressionApi.pending) await progressionApi.pending;
    return progressionApi.engagement;
  },
  apiAdminProgressionSaveConfig: async () => ({ error: null }),
  apiAdminProgressionSaveLevel: async () => ({ error: null }),
  apiAdminProgressionLoadUser: async () => ({
    progression: null,
    xpHistory: [],
    starterHistory: [],
    error: "not loaded",
  }),
  apiAdminProgressionAdjust: async () => ({ error: null }),
  apiAdminProgressionToggleFeatureFlag: async () => ({ flags: null, rows: null, error: null }),
  apiAdminProgressionSaveMission: async () => ({ error: null }),
  apiAdminProgressionArchiveMission: async () => ({ error: null }),
  apiAdminProgressionSaveDailyReward: async () => ({ error: null }),
  apiAdminProgressionSaveDailyPolicy: async () => ({ error: null }),
  apiAdminProgressionSaveBattleEnergyCaps: async () => ({ caps: null, error: null }),
}));

vi.mock("@/lib/toast", () => ({
  showToast: (message: string) => toast(message),
}));

function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/admin/progression"]}>
        <Routes>
          <Route path="/admin/progression" element={<AdminProgression />} />
          <Route path="/admin" element={<div>admin-home</div>} />
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
      await Promise.resolve();
    });
  }
  throw new Error("waitUntil timeout");
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-078 Admin Progression", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    authState.user = { id: "admin-1", isAdmin: true };
    progressionApi.config.error = null;
    progressionApi.config.config = [
      { source: "daily_activity", xpAmount: 10, enabled: true, description: "Eligible daily activity" },
    ];
    progressionApi.config.levels = [
      { level: 1, totalXpRequired: 207, title: "New Supporter", badgeCode: "new_supporter" },
    ];
    progressionApi.engagement.error = null;
    progressionApi.pending = null;
    toast.mockClear();
  });

  it("shows loading then the frozen admin sections without treating script titles as HTML", async () => {
    let resolveHold: (() => void) | undefined;
    progressionApi.pending = new Promise((resolve) => {
      resolveHold = resolve;
    });
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain(ADMIN_PROGRESSION_LOADING);
    expect(container.textContent).not.toContain(ADMIN_PROGRESSION_MISSIONS_TITLE);
    resolveHold?.();
    await waitUntil(() => (container?.textContent || "").includes(ADMIN_PROGRESSION_FLAGS_TITLE));
    expect(container.textContent).toContain(ADMIN_PROGRESSION_TITLE);
    expect(container.textContent).toContain(ADMIN_PROGRESSION_MISSIONS_TITLE);
    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(container.querySelector("script")).toBeNull();
    expect(namedHardwareBackTarget("/admin/progression")).toBe("/admin");
    const back = [...container.querySelectorAll("button")].find((button) => button.textContent === ADMIN_PROGRESSION_BACK);
    act(() => {
      back?.click();
    });
    await waitUntil(() => (container?.textContent || "").includes("admin-home"));
  });

  it("does not convert a failed load into hardcoded missions or flags", async () => {
    progressionApi.config.error = ADMIN_PROGRESSION_ERROR;
    progressionApi.config.config = null as never;
    progressionApi.config.levels = null as never;
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container?.textContent || "").includes(ADMIN_PROGRESSION_ERROR));
    expect(container.textContent).toContain(ADMIN_PROGRESSION_ERROR);
    expect(container.textContent).not.toContain("daily_like");
    expect(container.textContent).not.toContain("liveQuestsEnabled");
  });
});
