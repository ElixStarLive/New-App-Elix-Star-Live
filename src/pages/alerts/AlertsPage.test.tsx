import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { namedHardwareBackTarget, returnToFromLocationState } from "@/lib/settingsNav";

const api = vi.hoisted(() => ({
  apiListAlerts: vi.fn(),
  apiMarkAlertsRead: vi.fn(),
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
vi.mock("@/features/alerts/alertsApi", () => ({
  apiListAlerts: (...args: unknown[]) => api.apiListAlerts(...args),
  apiMarkAlertsRead: (...args: unknown[]) => api.apiMarkAlertsRead(...args),
}));
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (selector?: (state: { user: { id: string } }) => unknown) => {
    const state = { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } };
    return selector ? selector(state) : state;
  },
}));

import AlertsPage from "./AlertsPage";

function LocationProbe() {
  const location = useLocation();
  const returnTo = returnToFromLocationState(location.state);
  return <div>{`LOC ${location.pathname}${returnTo ? ` RT ${returnTo}` : ""}`}</div>;
}

function renderAlerts() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/alerts"]}>
        <Routes>
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/inbox" element={<LocationProbe />} />
          <Route path="/watch/:streamId" element={<LocationProbe />} />
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
  api.apiListAlerts.mockResolvedValue({ items: [], total: 0, unreadIds: [], error: null });
  api.apiMarkAlertsRead.mockResolvedValue({ ok: true });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("PAGE-032 Alerts", () => {
  it("shows empty copy and closes to Inbox", async () => {
    const view = renderAlerts();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.container.textContent).toContain("Alerts");
    expect(view.container.textContent).toContain("No alerts yet.");
    const close = view.container.querySelector('button[aria-label="Back to inbox"]');
    expect(close).toBeTruthy();
    act(() => {
      (close as HTMLButtonElement).click();
    });
    expect(view.container.textContent).toContain("LOC /inbox");
  });

  it("lists a real system alert and a live row, then hands live to watch with Inbox returnTo", async () => {
    api.apiListAlerts.mockResolvedValue({
      items: [
        {
          id: "sys-1",
          kind: "system",
          title: "System notice",
          body: "Hello",
          imageUrl: null,
          actionUrl: null,
          createdAt: "2026-08-21T00:00:00.000Z",
        },
        {
          id: "live-1",
          kind: "live_started",
          title: "Fan is live",
          body: "",
          imageUrl: null,
          actionUrl: "/watch/room-32",
          createdAt: "2026-08-21T00:00:00.000Z",
        },
      ],
      total: 2,
      unreadIds: ["sys-1"],
      error: null,
    });
    const view = renderAlerts();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.container.textContent).toContain("System notice");
    expect(view.container.textContent).toContain("Fan is live");
    expect(view.container.textContent).not.toContain("No alerts yet.");
    const live = [...view.container.querySelectorAll("button")].find((btn) => btn.textContent?.includes("Fan is live"));
    expect(live).toBeTruthy();
    act(() => {
      live?.click();
    });
    expect(view.container.textContent).toContain("LOC /watch/room-32");
    expect(view.container.textContent).toContain("RT /inbox");
  });

  it("shows API failure instead of empty copy", async () => {
    api.apiListAlerts.mockResolvedValue({ items: [], total: 0, unreadIds: [], error: "offline" });
    const view = renderAlerts();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.container.textContent).toContain("offline");
    expect(view.container.textContent).not.toContain("No alerts yet.");
  });

  it("keeps hardware back from Alerts as Inbox", () => {
    expect(namedHardwareBackTarget("/alerts")).toBe("/inbox");
  });
});
