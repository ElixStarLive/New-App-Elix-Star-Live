import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_USERS_BAN_CONFIRM,
  ADMIN_USERS_ERROR,
  ADMIN_USERS_LOADING,
  ADMIN_USERS_TITLE,
  ADMIN_USERS_UNBAN_CONFIRM,
} from "@/content/adminUsers";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import AdminUsers from "./Users";

const authState = vi.hoisted(() => ({
  user: { id: "admin-1", isAdmin: true } as { id: string; isAdmin: boolean } | null,
}));

const usersApi = vi.hoisted(() => ({
  query: "",
  result: {
    users: [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        username: "target",
        email: "target@example.com",
        avatarUrl: null,
        createdAt: "2026-01-02T00:00:00.000Z",
        isBanned: false,
      },
    ],
    error: null as string | null,
  },
  ban: { ok: true as const, isBanned: true as const },
  unban: { ok: true as const, isBanned: false as const },
}));

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: Object.assign((selector: (state: typeof authState) => unknown) => selector(authState), {
    getState: () => authState,
  }),
}));

vi.mock("@/features/admin/adminApi", () => ({
  apiFetchAdminUsers: (query = "") => {
    usersApi.query = query;
    return Promise.resolve(usersApi.result);
  },
  apiAdminBanUser: () => Promise.resolve(usersApi.ban),
  apiAdminUnbanUser: () => Promise.resolve(usersApi.unban),
}));

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname} STATE ${JSON.stringify(location.state ?? null)}`}</div>;
}

function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/admin/users"]}>
        <Routes>
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/profile/:userId" element={<LocationProbe />} />
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

describe("PAGE-071 Admin Users", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    authState.user = { id: "admin-1", isAdmin: true };
    usersApi.query = "";
    usersApi.result = {
      users: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          username: "target",
          email: "target@example.com",
          avatarUrl: null,
          createdAt: "2026-01-02T00:00:00.000Z",
          isBanned: false,
        },
      ],
      error: null,
    };
    usersApi.ban = { ok: true, isBanned: true };
    usersApi.unban = { ok: true, isBanned: false };
    vi.restoreAllMocks();
  });

  it("shows loading then the frozen table and search", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    expect(container.textContent).toContain(ADMIN_USERS_LOADING);
    expect(container.textContent).not.toContain("target@example.com");
    await waitUntil(() => (container?.querySelector("h1")?.textContent || "").includes(ADMIN_USERS_TITLE));
    expect(container.querySelector("h1")?.textContent).toBe(ADMIN_USERS_TITLE);
    expect(container.textContent).toContain("User");
    expect(container.textContent).toContain("Email");
    expect(container.textContent).toContain("Joined");
    expect(container.textContent).toContain("Actions");
    expect(container.textContent).toContain("target");
    expect(container.textContent).toContain("target@example.com");
    expect(container.textContent).toContain("Ban");
    expect(container.textContent).toContain("View");
    expect(container.textContent).not.toContain("Resolve");
    expect(container.querySelector("form")).toBeNull();
    expect(namedHardwareBackTarget("/admin/users")).toBe("/admin");
  });

  it("does not convert a failed load into an empty user table", async () => {
    usersApi.result = { users: null as never, error: ADMIN_USERS_ERROR };
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => (container?.textContent || "").includes(ADMIN_USERS_ERROR));
    expect(container.textContent).toContain(ADMIN_USERS_ERROR);
    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).not.toContain("target@example.com");
  });

  it("sends search to the server and does not keep a stale first query", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean(container?.querySelector("input")));
    const input = container.querySelector("input") as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "ab");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await waitUntil(() => usersApi.query === "ab");
    expect(usersApi.query).toBe("ab");
  });

  it("bans only after confirm and server success", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Ban")));
    const ban = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Ban");
    await act(async () => {
      ban?.click();
      await Promise.resolve();
    });
    expect(confirm).toHaveBeenCalledWith(ADMIN_USERS_BAN_CONFIRM);
    await waitUntil(() => (container?.textContent || "").includes("Unban"));
    expect(container.textContent).toContain("Unban");
    expect(container.textContent).not.toMatch(/\bBan\b/);
  });

  it("keeps the previous row when confirm is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Ban")));
    const ban = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Ban");
    act(() => {
      ban?.click();
    });
    expect(container.textContent).toContain("Ban");
    expect(container.textContent).not.toContain("Unban");
  });

  it("unbans only after confirm and server success", async () => {
    usersApi.result.users[0].isBanned = true;
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent === "Unban")));
    const unban = [...container.querySelectorAll("button")].find((button) => button.textContent === "Unban");
    await act(async () => {
      unban?.click();
      await Promise.resolve();
    });
    expect(confirm).toHaveBeenCalledWith(ADMIN_USERS_UNBAN_CONFIRM);
    await waitUntil(() => Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Ban")));
    expect(container.textContent).toContain("Ban");
  });

  it("hands View to the existing profile route with a Users return", async () => {
    const view = renderPage();
    root = view.root;
    container = view.container;
    await waitUntil(() => Boolean([...container!.querySelectorAll("button")].find((button) => button.textContent === "View")));
    const viewBtn = [...container.querySelectorAll("button")].find((button) => button.textContent === "View");
    act(() => {
      viewBtn?.click();
    });
    expect(container.textContent).toContain("LOC /profile/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(container.textContent).toContain('STATE {"returnTo":"/admin/users"}');
  });
});
