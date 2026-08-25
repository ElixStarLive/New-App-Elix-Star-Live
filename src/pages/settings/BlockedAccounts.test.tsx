import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import { SAFETY_HOME } from "./SafetyCenter";
import BlockedAccounts, { BLOCKED_HOME } from "./BlockedAccounts";

const api = vi.hoisted(() => ({
  apiListBlockedUsers: vi.fn(),
  apiUnblockUser: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
const checkUser = vi.hoisted(() => vi.fn(async () => undefined));
const auth = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  checkUser: () => checkUser(),
}));

vi.mock("@/features/blocks/blockedUsersApi", () => api);
vi.mock("@/lib/toast", () => ({ showToast: (...args: unknown[]) => toast(...args) }));
vi.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector?: (state: typeof auth) => unknown) => (selector ? selector(auth) : auth);
  useAuthStore.getState = () => auth;
  return { useAuthStore };
});

const target = {
  blockedUserId: "22222222-2222-4222-8222-222222222222",
  username: "maya",
  displayName: "Maya",
  avatarUrl: "https://cdn.example/m.png",
  createdAt: new Date().toISOString(),
};

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderBlocked(entry: string | { pathname: string; state?: unknown } = BLOCKED_HOME) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[typeof entry === "string" ? entry : { pathname: entry.pathname, state: entry.state }]}>
        <Routes>
          <Route path="/settings/blocked" element={<BlockedAccounts />} />
          <Route path="/settings" element={<LocationProbe />} />
          <Route path="/settings/safety" element={<LocationProbe />} />
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

describe("PAGE-044 Blocked Accounts", () => {
  beforeEach(() => {
    api.apiListBlockedUsers.mockReset();
    api.apiUnblockUser.mockReset();
    toast.mockReset();
    checkUser.mockReset();
    auth.user = { id: "11111111-1111-4111-8111-111111111111" };
    api.apiListBlockedUsers.mockResolvedValue({ ok: true, rows: [target] });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  it("uses the Settings option sheet and exact blocked row chrome", async () => {
    const view = renderBlocked();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Maya"));
    expect(container.querySelector(".elix-sheet-host")).toBeTruthy();
    expect(container.querySelector("h1")?.textContent).toBe("Blocked Accounts");
    expect(container.querySelector('button[aria-label="Close"]')).toBeTruthy();
    expect((container.querySelector("input") as HTMLInputElement | null)?.placeholder).toBe("Search blocked users...");
    expect(container.textContent).toContain("Maya");
    expect(container.textContent).toContain("Blocked today");
    expect(container.textContent).toContain("Unblock");
    expect(container.textContent).not.toContain("No blocked accounts");
    expect(container.textContent).not.toContain("You haven't blocked anyone");
    expect(container.querySelectorAll("button").length).toBeGreaterThan(1);
  });

  it("shows loading, then empty, without mixing error into empty", async () => {
    let resolveList: ((value: { ok: true; rows: typeof target[] }) => void) | undefined;
    api.apiListBlockedUsers.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );
    const view = renderBlocked();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain("Loading...");
    expect(container.textContent).not.toContain("You haven't blocked anyone");
    expect(container.textContent).not.toContain("No blocked users found");
    await act(async () => {
      resolveList?.({ ok: true, rows: [] });
    });
    await waitUntil(() => (container!.textContent || "").includes("You haven't blocked anyone"));
    expect(container.textContent).not.toContain("Loading...");
    expect(container.textContent).not.toContain("Failed to load blocked users");
  });

  it("shows an honest error instead of empty when the list fails", async () => {
    api.apiListBlockedUsers.mockResolvedValue({ ok: false, error: "offline", sessionExpired: false });
    const view = renderBlocked();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("offline"));
    expect(container.textContent).not.toContain("You haven't blocked anyone");
    expect(container.textContent).not.toContain("No blocked users found");
  });

  it("filters the loaded list locally and does not open a profile", async () => {
    const view = renderBlocked();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Maya"));
    act(() => {
      const input = container!.querySelector("input") as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "zzz");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await waitUntil(() => (container!.textContent || "").includes("No blocked users found"));
    expect(container.textContent).not.toContain("Maya");
    expect(container.querySelector("a")).toBeNull();
  });

  it("unblocks from the server and keeps the row after failure", async () => {
    const view = renderBlocked();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container!.textContent || "").includes("Unblock"));
    api.apiUnblockUser.mockResolvedValueOnce({ ok: false, error: "Failed to unblock user", sessionExpired: false });
    act(() => {
      [...container!.querySelectorAll("button")].find((button) => button.textContent === "Unblock")?.click();
    });
    await waitUntil(() => toast.mock.calls.length === 1);
    expect(container.textContent).toContain("Maya");
    api.apiUnblockUser.mockResolvedValueOnce({ ok: true });
    act(() => {
      [...container!.querySelectorAll("button")].find((button) => button.textContent === "Unblock")?.click();
    });
    await waitUntil(() => (container!.textContent || "").includes("You haven't blocked anyone"));
    expect(api.apiUnblockUser).toHaveBeenCalledTimes(2);
    expect(api.apiUnblockUser).toHaveBeenCalledWith(target.blockedUserId);
  });

  it("closes to Settings on named back, hardware back, and a cold deep link", async () => {
    const view = renderBlocked();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean(container!.querySelector('button[aria-label="Close"]')));
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(container.textContent).toContain("STATE null");
    expect(namedHardwareBackTarget(BLOCKED_HOME)).toBe("/settings");
    expect(namedHardwareBackTarget(BLOCKED_HOME, { returnTo: "/settings" })).toBe("/settings");
  });

  it("returns to Safety Center when opened from PAGE-041", async () => {
    const view = renderBlocked({ pathname: BLOCKED_HOME, state: { returnTo: SAFETY_HOME } });
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean(container!.querySelector('button[aria-label="Close"]')));
    act(() => {
      (container!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain(`LOC ${SAFETY_HOME}`);
    expect(namedHardwareBackTarget(BLOCKED_HOME, { returnTo: SAFETY_HOME })).toBe(SAFETY_HOME);
  });
});
