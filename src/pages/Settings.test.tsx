import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeDialogProvider } from "@/components/NativeDialog";
import { resetSettingsActionLocksForTests } from "@/features/settings/settingsSession";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useSettingsStore } from "@/store/useSettingsStore";

const auth = vi.hoisted(() => ({
  user: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    username: "owner",
    displayName: "Owner",
    avatarUrl: null,
    bio: "",
    isVerified: false,
    followerCount: 0,
    followingCount: 0,
    email: "owner@example.com",
    isAdmin: false,
    emailConfirmed: true,
  } as null | {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string;
    isVerified: boolean;
    followerCount: number;
    followingCount: number;
    email: string;
    isAdmin: boolean;
    emailConfirmed: boolean;
  },
  lastError: null as string | null,
  signOut: vi.fn(async () => undefined),
}));

const flags = vi.hoisted(() => ({ hub: true }));
const deleteAccount = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/config/engagementFlags", () => ({
  isEngagementHubEnabled: () => flags.hub,
}));
vi.mock("@/features/auth/authSession", () => ({
  authDeleteAccount: () => deleteAccount(),
}));
vi.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector?: (state: typeof auth) => unknown) => (selector ? selector(auth) : auth);
  useAuthStore.getState = () => auth;
  return { useAuthStore };
});

import Settings from "./Settings";

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}${location.search} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderSettings(entry = "/settings") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <NativeDialogProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/settings" element={<Settings />} />
            <Route path="/profile" element={<LocationProbe />} />
            <Route path="/login" element={<LocationProbe />} />
            <Route path="/edit-profile" element={<LocationProbe />} />
            <Route path="/settings/safety" element={<LocationProbe />} />
            <Route path="/settings/security" element={<LocationProbe />} />
            <Route path="/settings/payout" element={<LocationProbe />} />
            <Route path="/settings/notifications" element={<LocationProbe />} />
            <Route path="/settings/blocked" element={<LocationProbe />} />
            <Route path="/engagement" element={<LocationProbe />} />
            <Route path="/admin" element={<LocationProbe />} />
            <Route path="/saved" element={<LocationProbe />} />
            <Route path="/how-it-works" element={<LocationProbe />} />
            <Route path="/support" element={<LocationProbe />} />
            <Route path="/terms" element={<LocationProbe />} />
            <Route path="/privacy" element={<LocationProbe />} />
            <Route path="/guidelines" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </NativeDialogProvider>,
    );
  });
  return { container, root };
}

function row(container: HTMLElement, label: string) {
  return [...container.querySelectorAll("button")].find((button) => button.textContent?.includes(label));
}

function visibleLabels(container: HTMLElement): string[] {
  return [...container.querySelectorAll("button")]
    .map((button) => (button.textContent || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

describe("PAGE-040 Settings", () => {
  beforeEach(() => {
    resetSettingsActionLocksForTests();
    flags.hub = true;
    auth.user = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      username: "owner",
      displayName: "Owner",
      avatarUrl: null,
      bio: "",
      isVerified: false,
      followerCount: 0,
      followingCount: 0,
      email: "owner@example.com",
      isAdmin: false,
      emailConfirmed: true,
    };
    auth.lastError = null;
    auth.signOut.mockReset();
    auth.signOut.mockResolvedValue(undefined);
    deleteAccount.mockReset();
    deleteAccount.mockResolvedValue({ ok: true });
    useSettingsStore.setState({
      muteAllSounds: false,
      notificationsEnabled: true,
      liveNotifications: true,
      language: "en",
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

  it("uses the option-sheet chrome and exact row order", () => {
    const view = renderSettings();
    root = view.root;
    container = view.container;
    expect(container.querySelector(".elix-sheet-host")).toBeTruthy();
    expect(container.querySelector("h1")?.textContent).toBe("Settings");
    const labels = visibleLabels(container);
    expect(labels).toContain("Edit Profile");
    expect(labels).toContain("Privacy");
    expect(labels).toContain("Security");
    expect(labels).toContain("Delete Account");
    expect(labels).toContain("Creator payout");
    expect(labels).toContain("Engagement Hub");
    expect(labels).not.toContain("Admin");
    expect(labels.indexOf("Edit Profile")).toBeLessThan(labels.indexOf("Privacy"));
    expect(labels.indexOf("Privacy")).toBeLessThan(labels.indexOf("Security"));
    expect(labels.indexOf("Security")).toBeLessThan(labels.indexOf("Delete Account"));
    expect(labels.indexOf("Delete Account")).toBeLessThan(labels.indexOf("Creator payout"));
    const labelIndex = (needle: string) => labels.findIndex((label) => label.includes(needle));
    expect(labelIndex("Notifications")).toBeLessThan(labelIndex("Live notifications"));
    expect(labelIndex("Live notifications")).toBeLessThan(labelIndex("Mute all sounds"));
    expect(labelIndex("Liked Videos")).toBeLessThan(labelIndex("Saved videos"));
    expect(labels.indexOf("Blocked Accounts")).toBeLessThan(labels.indexOf("Safety Center"));
    expect(labels.indexOf("How the app works")).toBeLessThan(labels.indexOf("Help & Support"));
    expect(container.textContent).toContain("v1.0.0");
    expect(container.textContent).not.toMatch(/window\.confirm|history\.back|location\.reload/);
  });

  it("closes to Profile and hardware back names Profile", () => {
    const view = renderSettings();
    root = view.root;
    container = view.container;
    const close = container.querySelector('button[aria-label="Close"]') as HTMLButtonElement;
    act(() => {
      close.click();
    });
    expect(container.textContent).toContain("LOC /profile");
    expect(namedHardwareBackTarget("/settings")).toBe("/profile");
  });

  it("hands children Settings returnTo on every completed destination", () => {
    const cases: Array<[string, string]> = [
      ["Edit Profile", "LOC /edit-profile"],
      ["Privacy", "LOC /settings/safety"],
      ["Security", "LOC /settings/security"],
      ["Creator payout", "LOC /settings/payout"],
      ["Engagement Hub", "LOC /engagement"],
      ["Notifications", "LOC /settings/notifications"],
      ["Liked Videos", "LOC /profile?tab=liked"],
      ["Saved videos", "LOC /saved"],
      ["Blocked Accounts", "LOC /settings/blocked"],
      ["Safety Center", "LOC /settings/safety"],
      ["How the app works", "LOC /how-it-works"],
      ["Help & Support", "LOC /support"],
      ["Terms", "LOC /terms"],
      ["Guidelines", "LOC /guidelines"],
    ];
    for (const [label, location] of cases) {
      act(() => {
        root?.unmount();
        container?.remove();
      });
      const view = renderSettings();
      root = view.root;
      container = view.container;
      act(() => {
        row(container!, label)?.click();
      });
      expect(container.textContent).toContain(location);
      expect(container.textContent).toContain('STATE {"returnTo":"/settings"}');
    }
    expect(namedHardwareBackTarget("/settings/safety", { returnTo: "/settings" })).toBe("/settings");
    expect(namedHardwareBackTarget("/settings/payout", { returnTo: "/settings" })).toBe("/settings");
    expect(namedHardwareBackTarget("/edit-profile")).toBe("/settings");
    expect(namedHardwareBackTarget("/saved")).toBe("/settings");
    expect(namedHardwareBackTarget("/how-it-works")).toBe("/settings");
    expect(namedHardwareBackTarget("/support")).toBe("/settings");
    expect(namedHardwareBackTarget("/terms")).toBe("/settings");
    expect(namedHardwareBackTarget("/privacy")).toBe("/settings");
    expect(namedHardwareBackTarget("/guidelines")).toBe("/settings");
  });

  it("opens the footer Privacy policy document, not Safety Center", () => {
    const view = renderSettings();
    root = view.root;
    container = view.container;
    const privacyButtons = [...container.querySelectorAll("button")].filter((button) =>
      (button.textContent || "").replace(/\s+/g, " ").trim().startsWith("Privacy"),
    );
    expect(privacyButtons.length).toBeGreaterThan(1);
    act(() => {
      privacyButtons[privacyButtons.length - 1]?.click();
    });
    expect(container.textContent).toContain("LOC /privacy");
    expect(container.textContent).toContain('STATE {"returnTo":"/settings"}');
  });

  it("always shows Engagement Hub like OLD", () => {
    const view = renderSettings();
    root = view.root;
    container = view.container;
    expect(visibleLabels(container)).toContain("Engagement Hub");
  });

  it("shows Admin only when profiles.is_admin is true", () => {
    auth.user = { ...auth.user!, isAdmin: true };
    const view = renderSettings();
    root = view.root;
    container = view.container;
    expect(visibleLabels(container)).toContain("Admin");
    act(() => {
      row(container!, "Admin")?.click();
    });
    expect(container.textContent).toContain("LOC /admin");
    expect(container.textContent).toContain('STATE {"returnTo":"/settings"}');
  });

  it("does not treat email as admin authority", () => {
    auth.user = { ...auth.user!, email: "admin@elixstarlive.app", isAdmin: false };
    const view = renderSettings();
    root = view.root;
    container = view.container;
    expect(visibleLabels(container)).not.toContain("Admin");
  });

  it("drops a stale admin row after a non-admin session is shown", () => {
    auth.user = { ...auth.user!, isAdmin: true };
    let view = renderSettings();
    root = view.root;
    container = view.container;
    expect(visibleLabels(container)).toContain("Admin");
    act(() => {
      root?.unmount();
      container?.remove();
    });
    auth.user = { ...auth.user!, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", isAdmin: false };
    view = renderSettings();
    root = view.root;
    container = view.container;
    expect(visibleLabels(container)).not.toContain("Admin");
  });

  it("toggles live notifications and mute on the shared store", () => {
    const view = renderSettings();
    root = view.root;
    container = view.container;
    act(() => {
      row(container!, "Live notifications")?.click();
    });
    expect(useSettingsStore.getState().liveNotifications).toBe(false);
    act(() => {
      row(container!, "Mute all sounds")?.click();
    });
    expect(useSettingsStore.getState().muteAllSounds).toBe(true);
    expect(showToast).toHaveBeenCalledWith("All app sounds muted");
    act(() => {
      row(container!, "Mute all sounds")?.click();
    });
    expect(useSettingsStore.getState().muteAllSounds).toBe(false);
    expect(showToast).toHaveBeenCalledWith("App sounds on");
  });

  it("keeps dark mode always-on and video quality auto as toasts", () => {
    const view = renderSettings();
    root = view.root;
    container = view.container;
    act(() => {
      row(container!, "Dark Mode")?.click();
    });
    expect(showToast).toHaveBeenCalledWith("Dark mode is always on");
    act(() => {
      row(container!, "Video Quality")?.click();
    });
    expect(showToast).toHaveBeenCalledWith("Video quality is set to auto");
  });

  it("opens the language picker instead of toasting a fake locale", () => {
    const view = renderSettings();
    root = view.root;
    container = view.container;
    act(() => {
      row(container!, "Language")?.click();
    });
    expect(container.textContent).toContain("Choose language");
    expect(container.textContent).toContain("Română");
    const romanian = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Română"));
    act(() => {
      romanian?.click();
    });
    expect(useSettingsStore.getState().language).toBe("ro");
    expect(showToast).not.toHaveBeenCalledWith("English");
  });

  it("logs out once through the auth owner and leaves to login", async () => {
    let release: (() => void) | undefined;
    auth.signOut.mockImplementation(
      () =>
        new Promise<undefined>((resolve) => {
          release = () => resolve(undefined);
        }),
    );
    const view = renderSettings();
    root = view.root;
    container = view.container;
    const logout = row(container, "Log Out");
    act(() => {
      logout?.click();
      logout?.click();
      logout?.click();
    });
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    await act(async () => {
      release?.();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("LOC /login");
  });

  it("shows the logout server error without inventing success copy", async () => {
    auth.signOut.mockImplementation(async () => {
      auth.lastError = "Network offline";
    });
    const view = renderSettings();
    root = view.root;
    container = view.container;
    await act(async () => {
      row(container!, "Log Out")?.click();
      await Promise.resolve();
    });
    expect(showToast).toHaveBeenCalledWith("Network offline");
    expect(container.textContent).toContain("LOC /login");
  });

  it("cancels delete without calling the API", async () => {
    const view = renderSettings();
    root = view.root;
    container = view.container;
    await act(async () => {
      row(container!, "Delete Account")?.click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Are you sure you want to delete your account?");
    const cancel = [...container.querySelectorAll("button")].find((button) => button.textContent === "Cancel");
    await act(async () => {
      cancel?.click();
      await Promise.resolve();
    });
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Settings");
  });

  it("confirms delete once then leaves after server success", async () => {
    let release: ((value: { ok: true }) => void) | undefined;
    deleteAccount.mockImplementation(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          release = resolve;
        }),
    );
    const view = renderSettings();
    root = view.root;
    container = view.container;
    await act(async () => {
      row(container!, "Delete Account")?.click();
      await Promise.resolve();
    });
    const confirm = [...container.querySelectorAll("button")].find((button) => button.textContent === "Confirm");
    await act(async () => {
      confirm?.click();
      confirm?.click();
      await Promise.resolve();
    });
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    await act(async () => {
      release?.({ ok: true });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("LOC /login");
  });

  it("keeps the session on delete failure", async () => {
    deleteAccount.mockResolvedValue({ ok: false, error: "Database unavailable" } as never);
    const view = renderSettings();
    root = view.root;
    container = view.container;
    await act(async () => {
      row(container!, "Delete Account")?.click();
      await Promise.resolve();
    });
    const confirm = [...container.querySelectorAll("button")].find((button) => button.textContent === "Confirm");
    await act(async () => {
      confirm?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("Database unavailable");
    expect(container.textContent).toContain("Settings");
  });
});
