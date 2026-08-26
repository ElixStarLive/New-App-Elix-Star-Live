import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import { useSettingsStore } from "@/store/useSettingsStore";
import NotificationSettings, { NOTIFICATIONS_HOME } from "./NotificationSettings";

const registerPushToken = vi.hoisted(() => vi.fn(async () => undefined));
const unregisterPushToken = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/pushRegister", () => ({
  registerPushToken: () => registerPushToken(),
  unregisterPushToken: () => unregisterPushToken(),
}));

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderNotifications(entry: string | { pathname: string; state?: unknown } = NOTIFICATIONS_HOME) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}>
        <Routes>
          <Route path="/settings/notifications" element={<NotificationSettings />} />
          <Route path="/settings" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

function row(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].find((button) => button.textContent?.includes(label));
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-043 Notification Settings", () => {
  beforeEach(() => {
    registerPushToken.mockReset();
    unregisterPushToken.mockReset();
    useSettingsStore.setState({
      notificationsEnabled: true,
      liveNotifications: true,
    });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("uses the Settings option sheet and exact rows", () => {
    const view = renderNotifications();
    root = view.root;
    container = view.container;
    expect(container.querySelector(".elix-sheet-host")).toBeTruthy();
    expect(container.querySelector("h1")?.textContent).toBe("Notifications");
    expect(container.querySelector('button[aria-label="Close"]')).toBeTruthy();
    expect(container.textContent).toContain("App notifications");
    expect(container.textContent).toContain("General in-app notification preference (saved on this device).");
    expect(container.textContent).toContain("Live notifications");
    expect(container.textContent).toContain("Alerts when creators you follow go live.");
    expect(container.textContent).toContain("Preferences are stored locally on this device. Push delivery also requires device");
    expect(container.textContent).toContain("permission.");
    expect(container.querySelector("input[type='checkbox']")).toBeNull();
    expect(container.textContent).not.toContain("Push notifications");
    expect(container.textContent).not.toContain("registered");
    expect(container.textContent).not.toContain("sent: true");
  });

  it("closes to Settings on named back and hardware back", () => {
    const view = renderNotifications();
    root = view.root;
    container = view.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget(NOTIFICATIONS_HOME)).toBe("/settings");
    expect(namedHardwareBackTarget(NOTIFICATIONS_HOME, { returnTo: "/settings" })).toBe("/settings");
  });

  it("toggles the shared local preferences, registers on enable, and unregisters on disable", () => {
    const view = renderNotifications();
    root = view.root;
    container = view.container;
    expect(row(container, "App notifications")?.textContent).toContain("On");
    act(() => {
      row(container!, "App notifications")?.click();
    });
    expect(useSettingsStore.getState().notificationsEnabled).toBe(false);
    expect(registerPushToken).not.toHaveBeenCalled();
    expect(unregisterPushToken).toHaveBeenCalledTimes(1);
    expect(row(container, "App notifications")?.textContent).toContain("Off");
    act(() => {
      row(container!, "App notifications")?.click();
    });
    expect(useSettingsStore.getState().notificationsEnabled).toBe(true);
    expect(registerPushToken).toHaveBeenCalledTimes(1);
    expect(unregisterPushToken).toHaveBeenCalledTimes(1);
    act(() => {
      row(container!, "Live notifications")?.click();
    });
    expect(useSettingsStore.getState().liveNotifications).toBe(false);
    expect(registerPushToken).toHaveBeenCalledTimes(1);
    expect(unregisterPushToken).toHaveBeenCalledTimes(1);
  });

  it("works from a cold deep link without Settings state", () => {
    const view = renderNotifications();
    root = view.root;
    container = view.container;
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(container.textContent).toContain("STATE null");
  });
});
