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
      { source: "daily_activity", xp_amount: 10, enabled: true, description: "Eligible daily activity" },
    ],
    levels: [{ level: 1, total_xp_required: 207, title: "New Supporter", badge_code: "new_supporter" }],
    error: null as string | null,
  },
  engagement: {
    flags: { liveQuestsEnabled: false, engagementHubEnabled: true } as Record<string, boolean>,
    rows: [
      {
        key: "liveQuestsEnabled",
        effective: false,
        default_value: false,
        env_value: false,
        admin_value: null,
        last_changed_by: null,
        last_changed_at: null,
        reason: null,
      },
    ],
    missions: [
      {
        id: "daily_like",
        title: "<script>alert(1)</script>",
        goal_count: 5,
        reward_xp: 0,
        reward_promo_coins: 10,
        reward_energy: 0,
        enabled: true,
        metric_key: "like",
        scope: "daily",
        audience: "all_authenticated",
        starts_at: null,
        ends_at: null,
        sort_order: 2,
      },
    ],
    rewards: [{ streak_day: 1, reward_xp: 100, reward_promo_coins: 0, reward_label: "100 XP" }],
    policy: {
      streak_reset_policy: "miss_one_day" as const,
      effective_start: "",
      effective_end: "",
      active: true,
    },
    caps: {
      watch_amount: 5,
      comment_amount: 2,
      share_amount: 20,
      watch_cap: 300,
      comment_cap: 20,
      share_cap: 1,
      storage_cap: 10000,
      session_cap: 500,
      daily_cap: 2000,
      minimum_boost: 1,
      allowed_boost_values: [1, 2, 5, 10],
      fan_energy_threshold: 10000,
      score_multiplier: 1.2,
      boost_duration_sec: 5,
      enabled: true,
    },
    entries: [
      {
        id: "1",
        admin_user_id: "admin-1",
        action: "xp_config_update",
        target: "daily_activity",
        created_at: "2026-08-22T00:00:00.000Z",
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
    xp_history: [],
    starter_history: [],
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
      { source: "daily_activity", xp_amount: 10, enabled: true, description: "Eligible daily activity" },
    ];
    progressionApi.config.levels = [
      { level: 1, total_xp_required: 207, title: "New Supporter", badge_code: "new_supporter" },
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
