import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_DASHBOARD_ACTIONS,
  ADMIN_DASHBOARD_ERROR,
  ADMIN_DASHBOARD_LOADING,
  ADMIN_DASHBOARD_TITLE,
  formatAdminCount,
  formatAdminRevenueMajor,
} from "@/content/adminDashboard";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import AdminDashboard from "./Dashboard";

const authState = vi.hoisted(() => ({
  user: { id: "admin-1", isAdmin: true } as { id: string; isAdmin: boolean } | null,
}));

const dashboardApi = vi.hoisted(() => ({
  result: {
    data: {
      dailyActiveUsers: 7,
      totalUsers: 12,
      totalVideos: 3,
      liveRooms: 1,
      totalRevenueMinor: 15000,
      pendingReports: 2,
    },
    error: null as string | null,
  },
}));

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: Object.assign((selector: (state: typeof authState) => unknown) => selector(authState), {
    getState: () => authState,
  }),
}));

vi.mock("@/features/admin/adminApi", () => ({
  apiFetchAdminDashboard: () => Promise.resolve(dashboardApi.result),
}));

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}`}</div>;
}

function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<LocationProbe />} />
          <Route path="/admin/reports" element={<LocationProbe />} />
          <Route path="/admin/economy" element={<LocationProbe />} />
          <Route path="/admin/monetisation" element={<LocationProbe />} />
          <Route path="/admin/purchases" element={<LocationProbe />} />
          <Route path="/admin/withdrawals" element={<LocationProbe />} />
          <Route path="/admin/rising-stars" element={<LocationProbe />} />
          <Route path="/admin/progression" element={<LocationProbe />} />
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

describe("PAGE-070 Admin Dashboard", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    authState.user = { id: "admin-1", isAdmin: true };
    dashboardApi.result = {
      data: {
        dailyActiveUsers: 7,
        totalUsers: 12,
        totalVideos: 3,
        liveRooms: 1,
        totalRevenueMinor: 15000,
        pendingReports: 2,
      },
      error: null,
    };
  });

  it("shows loading then the frozen six cards and quick actions", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain(ADMIN_DASHBOARD_LOADING);
    expect(container.textContent).not.toContain("Daily Active Users");
    await waitUntil(() => (container?.querySelector("h1")?.textContent || "").includes(ADMIN_DASHBOARD_TITLE));
    expect(container.querySelector("h1")?.textContent).toContain(ADMIN_DASHBOARD_TITLE);
    expect(container.textContent).toContain("Daily Active Users");
    expect(container.textContent).toContain("Total Users");
    expect(container.textContent).toContain("Total Videos");
    expect(container.textContent).toContain("Live Rooms");
    expect(container.textContent).toContain("Total Revenue");
    expect(container.textContent).toContain("Pending Reports");
    expect(container.textContent).toContain(formatAdminCount(7));
    expect(container.textContent).toContain(formatAdminRevenueMajor(15000));
    expect(container.textContent).toContain("$150");
    for (const action of ADMIN_DASHBOARD_ACTIONS) {
      expect(container.textContent).toContain(action.label);
    }
    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).not.toContain("Ban");
    expect(container.textContent).not.toContain("Resolve");
    expect(namedHardwareBackTarget("/admin")).toBe("/settings");
  });

  it("does not convert a failed load into zero metrics", async () => {
    dashboardApi.result = { data: null as never, error: ADMIN_DASHBOARD_ERROR };
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container?.textContent || "").includes(ADMIN_DASHBOARD_ERROR));
    expect(container.textContent).toContain(ADMIN_DASHBOARD_ERROR);
    expect(container.textContent).not.toContain("Daily Active Users");
    expect(container.textContent).not.toContain("$0");
  });

  it("hands child admin routes without embedding their actions", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent === "Manage Users")));
    const users = [...container.querySelectorAll("button")].find((button) => button.textContent === "Manage Users");
    act(() => {
      users?.click();
    });
    expect(container.textContent).toContain("LOC /admin/users");
    expect(namedHardwareBackTarget("/admin/users")).toBe("/admin");
    expect(namedHardwareBackTarget("/admin/reports")).toBe("/admin");
  });

  it("hands Review Reports to /admin/reports", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent === "Review Reports")));
    const reports = [...container.querySelectorAll("button")].find((button) => button.textContent === "Review Reports");
    act(() => {
      reports?.click();
    });
    expect(container.textContent).toContain("LOC /admin/reports");
  });

  it("hands Economy Controls to /admin/economy", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent === "Economy Controls")));
    const economy = [...container.querySelectorAll("button")].find((button) => button.textContent === "Economy Controls");
    act(() => {
      economy?.click();
    });
    expect(container.textContent).toContain("LOC /admin/economy");
    expect(namedHardwareBackTarget("/admin/economy")).toBe("/admin");
  });

  it("hands Monetisation to /admin/monetisation", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent === "Monetisation")));
    const monetisation = [...container.querySelectorAll("button")].find((button) => button.textContent === "Monetisation");
    act(() => {
      monetisation?.click();
    });
    expect(container.textContent).toContain("LOC /admin/monetisation");
    expect(namedHardwareBackTarget("/admin/monetisation")).toBe("/admin");
  });

  it("hands IAP & Shop Purchases to /admin/purchases", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent === "IAP & Shop Purchases")));
    const purchases = [...container.querySelectorAll("button")].find((button) => button.textContent === "IAP & Shop Purchases");
    act(() => {
      purchases?.click();
    });
    expect(container.textContent).toContain("LOC /admin/purchases");
    expect(namedHardwareBackTarget("/admin/purchases")).toBe("/admin");
  });

  it("hands Withdrawals to /admin/withdrawals", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent === "Withdrawals")));
    const withdrawals = [...container.querySelectorAll("button")].find((button) => button.textContent === "Withdrawals");
    act(() => {
      withdrawals?.click();
    });
    expect(container.textContent).toContain("LOC /admin/withdrawals");
    expect(namedHardwareBackTarget("/admin/withdrawals")).toBe("/admin");
  });

  it("hands Rising Stars to /admin/rising-stars", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent === "Rising Stars")));
    const rising = [...container.querySelectorAll("button")].find((button) => button.textContent === "Rising Stars");
    act(() => {
      rising?.click();
    });
    expect(container.textContent).toContain("LOC /admin/rising-stars");
    expect(namedHardwareBackTarget("/admin/rising-stars")).toBe("/admin");
  });

  it("hands Starter Coins & XP to /admin/progression", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() =>
      Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent === "Starter Coins & XP")),
    );
    const progression = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Starter Coins & XP",
    );
    act(() => {
      progression?.click();
    });
    expect(container.textContent).toContain("LOC /admin/progression");
    expect(namedHardwareBackTarget("/admin/progression")).toBe("/admin");
  });
});
