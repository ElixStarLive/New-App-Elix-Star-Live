import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_MONETISATION_DASHBOARD_TITLE,
  ADMIN_MONETISATION_ERROR,
  ADMIN_MONETISATION_FORYOU_UNAVAILABLE,
  ADMIN_MONETISATION_FRAUD_EMPTY,
  ADMIN_MONETISATION_GIFTS_TITLE,
  ADMIN_MONETISATION_INVALID_VALUE,
  ADMIN_MONETISATION_LOADING,
  ADMIN_MONETISATION_RECONCILE_TITLE,
  ADMIN_MONETISATION_REPORT_TITLE,
  ADMIN_MONETISATION_REWARDS_TITLE,
  ADMIN_MONETISATION_SAVE_FAILED,
  ADMIN_MONETISATION_SAVED,
  ADMIN_MONETISATION_TITLE,
  ADMIN_MONETISATION_WITHDRAWALS_TITLE,
} from "@/content/adminMonetisation";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import AdminMonetisation from "./Monetisation";

const authState = vi.hoisted(() => ({
  user: { id: "admin-1", isAdmin: true } as { id: string; isAdmin: boolean } | null,
}));

const monetisationApi = vi.hoisted(() => ({
  result: {
    data: {
      config: { giftCreatorPct: 60, giftPlatformPct: 40, giftSettlementHours: 72 },
      dashboard: { currency: "GBP", iap: { c: 1, coins: 100 }, shop: { c: 0, pence: 0 } },
      report: { gifts: { creator_pence: 0, platform_pence: 0 } },
      withdrawals: [
        {
          id: "wd-1",
          user_id: "<script>alert(1)</script>",
          amount_pence: 2500,
          status: "requested",
          created_at: "2026-08-22T00:00:00.000Z",
        },
      ],
    },
    error: null as string | null,
  },
  patch: {
    ok: true as const,
    config: { giftCreatorPct: 60, giftPlatformPct: 40, giftSettlementHours: 73 },
  } as
    | { ok: true; config: { giftCreatorPct: number; giftPlatformPct: number; giftSettlementHours: number } }
    | { ok: false; error: string },
  lastPatch: null as { field: string; value: number; reason: string } | null,
  fetchCount: 0,
}));

const toast = vi.hoisted(() => vi.fn());

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: Object.assign((selector: (state: typeof authState) => unknown) => selector(authState), {
    getState: () => authState,
  }),
}));

vi.mock("@/features/admin/adminApi", () => ({
  apiFetchAdminMonetisation: () => {
    monetisationApi.fetchCount += 1;
    return Promise.resolve(monetisationApi.result);
  },
  apiAdminPatchMonetisationConfig: (field: string, value: number, reason: string) => {
    monetisationApi.lastPatch = { field, value, reason };
    if (monetisationApi.patch.ok && monetisationApi.result.data) {
      monetisationApi.result = {
        ...monetisationApi.result,
        data: { ...monetisationApi.result.data, config: monetisationApi.patch.config },
      };
    }
    return Promise.resolve(monetisationApi.patch);
  },
}));

vi.mock("@/lib/toast", () => ({ showToast: (...args: unknown[]) => toast(...args) }));

function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/admin/monetisation"]}>
        <Routes>
          <Route path="/admin/monetisation" element={<AdminMonetisation />} />
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

function setInputValue(input: HTMLInputElement, next: string) {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  proto?.set?.call(input, next);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-074 Admin Monetisation", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    authState.user = { id: "admin-1", isAdmin: true };
    monetisationApi.fetchCount = 0;
    monetisationApi.lastPatch = null;
    monetisationApi.result = {
      data: {
        config: { giftCreatorPct: 60, giftPlatformPct: 40, giftSettlementHours: 72 },
        dashboard: { currency: "GBP", iap: { c: 1, coins: 100 }, shop: { c: 0, pence: 0 } },
        report: { gifts: { creator_pence: 0, platform_pence: 0 } },
        withdrawals: [
          {
            id: "wd-1",
            user_id: "<script>alert(1)</script>",
            amount_pence: 2500,
            status: "requested",
            created_at: "2026-08-22T00:00:00.000Z",
          },
        ],
      },
      error: null,
    };
    monetisationApi.patch = {
      ok: true,
      config: { giftCreatorPct: 60, giftPlatformPct: 40, giftSettlementHours: 73 },
    };
    toast.mockReset();
  });

  it("shows loading then the frozen monetisation sections", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain(ADMIN_MONETISATION_LOADING);
    expect(container.textContent).not.toContain("2500p");
    await waitUntil(() => (container?.querySelector("h1")?.textContent || "").includes(ADMIN_MONETISATION_TITLE));
    expect(container.querySelector("h1")?.textContent).toContain(ADMIN_MONETISATION_TITLE);
    expect(container.textContent).toContain(ADMIN_MONETISATION_GIFTS_TITLE);
    expect(container.textContent).toContain(ADMIN_MONETISATION_REWARDS_TITLE);
    expect(container.textContent).toContain(ADMIN_MONETISATION_DASHBOARD_TITLE);
    expect(container.textContent).toContain(ADMIN_MONETISATION_REPORT_TITLE);
    expect(container.textContent).toContain(ADMIN_MONETISATION_RECONCILE_TITLE);
    expect(container.textContent).toContain(ADMIN_MONETISATION_FRAUD_EMPTY);
    expect(container.textContent).toContain(ADMIN_MONETISATION_FORYOU_UNAVAILABLE);
    expect(container.textContent).toContain(ADMIN_MONETISATION_WITHDRAWALS_TITLE);
    expect(container.textContent).toContain("2500p");
    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).not.toContain("Approve");
    expect(container.textContent).not.toContain("Reject");
    expect(container.textContent).not.toContain("Run now");
    expect(container.textContent).not.toContain("Run sweep");
    expect(namedHardwareBackTarget("/admin/monetisation")).toBe("/admin");
  });

  it("does not convert a failed load into default 60/40 values", async () => {
    monetisationApi.result = { data: null as never, error: ADMIN_MONETISATION_ERROR };
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container?.textContent || "").includes(ADMIN_MONETISATION_ERROR));
    expect(container.textContent).toContain(ADMIN_MONETISATION_ERROR);
    expect(container.textContent).not.toContain("Gift creator %");
    expect(container.textContent).not.toContain("2500p");
  });

  it("saves settlement hours from the authoritative PATCH then refreshes", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean(container?.querySelector('input[aria-label="Gift settlement hours"]')));
    const hours = container.querySelector('input[aria-label="Gift settlement hours"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(hours, "73");
    });
    const hoursSave = hours.parentElement?.querySelector("button");
    await act(async () => {
      hoursSave?.click();
      await Promise.resolve();
    });
    await waitUntil(() => toast.mock.calls.some((call) => call[0] === ADMIN_MONETISATION_SAVED));
    expect(monetisationApi.lastPatch).toEqual({
      field: "giftSettlementHours",
      value: 73,
      reason: "Admin update",
    });
    expect(monetisationApi.fetchCount).toBeGreaterThan(1);
  });

  it("rejects an invalid value without calling PATCH", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean(container?.querySelector('input[aria-label="Gift creator %"]')));
    const creator = container.querySelector('input[aria-label="Gift creator %"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(creator, "60.5");
    });
    const save = creator.parentElement?.querySelector("button");
    await act(async () => {
      save?.click();
      await Promise.resolve();
    });
    await waitUntil(() => toast.mock.calls.some((call) => call[0] === ADMIN_MONETISATION_INVALID_VALUE));
    expect(monetisationApi.lastPatch).toBeNull();
  });

  it("keeps the previous config when PATCH fails", async () => {
    monetisationApi.patch = { ok: false, error: "nope" };
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean(container?.querySelector('input[aria-label="Gift settlement hours"]')));
    const hours = container.querySelector('input[aria-label="Gift settlement hours"]') as HTMLInputElement;
    expect(hours.value).toBe("72");
    await act(async () => {
      setInputValue(hours, "74");
    });
    const save = hours.parentElement?.querySelector("button");
    await act(async () => {
      save?.click();
      await Promise.resolve();
    });
    await waitUntil(() => toast.mock.calls.some((call) => call[0] === ADMIN_MONETISATION_SAVE_FAILED));
    expect((container.querySelector('input[aria-label="Gift settlement hours"]') as HTMLInputElement).value).toBe("74");
    expect(container.querySelectorAll('input[aria-label="Gift settlement hours"]').length).toBe(1);
  });
});
