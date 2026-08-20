import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const authState = vi.hoisted(() => ({
  current: {
    user: null as null | {
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
    session: null as null | { token: string },
    isAuthenticated: false,
    isLoading: false,
  },
}));

vi.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector?: (state: typeof authState.current) => unknown) =>
    selector ? selector(authState.current) : authState.current;
  useAuthStore.getState = () => ({
    ...authState.current,
    checkUser: async () => undefined,
    signOut: async () => undefined,
  });
  useAuthStore.persist = {
    hasHydrated: () => true,
    onFinishHydration: () => () => undefined,
  };
  return { useAuthStore };
});

vi.mock("@/lib/wsClient", () => ({
  wsClient: {
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    isConnected: () => false,
    getCurrentRoomId: () => null,
    send: vi.fn(),
    reconnectOnForeground: vi.fn(),
  },
}));

vi.mock("@/lib/pushRegister", () => ({
  registerPushToken: async () => undefined,
}));

vi.mock("@/features/auth/authSession", () => ({
  authVerifyEmail: async () => ({ ok: true, alreadyConfirmed: false }),
  authForgotPassword: async () => ({ ok: true }),
  authResetPassword: async () => ({ ok: true }),
}));

vi.mock("@/pages/VideoFeed", () => ({ default: () => <div>feed-page</div> }));
vi.mock("@/pages/StemFeed", () => ({ default: () => <div>stem-page</div> }));
vi.mock("@/pages/Create", () => ({ default: () => <div>create-page</div> }));
vi.mock("@/pages/ChatThread", () => ({ default: () => <div>thread-page</div> }));
vi.mock("@/pages/FriendsFeed", () => ({ default: () => <div>friends-page</div> }));
vi.mock("@/pages/Profile", () => ({ default: () => <div>profile-page</div> }));
vi.mock("@/pages/Inbox", () => ({ default: () => <div>inbox-page</div> }));
vi.mock("@/pages/LiveDiscover", () => ({ default: () => <div>live-discover-page</div> }));
vi.mock("@/pages/VideoCall", () => ({ default: () => <div>call-page</div> }));
vi.mock("@/pages/admin/Dashboard", () => ({ default: () => <div>admin-page</div> }));
vi.mock("@/features/live/spectator/SpectatorLiveShell", () => ({
  default: () => <div>watch-page</div>,
}));

const authedUser = {
  id: "11111111-1111-1111-1111-111111111111",
  username: "tester",
  displayName: "Tester",
  avatarUrl: null,
  bio: "",
  isVerified: false,
  followerCount: 0,
  followingCount: 0,
  email: "tester@example.com",
  isAdmin: false,
  emailConfirmed: true,
};

function setUnauthed() {
  authState.current = {
    user: null,
    session: null,
    isAuthenticated: false,
    isLoading: false,
  };
}

function setAuthed(isAdmin = false) {
  authState.current = {
    user: { ...authedUser, isAdmin },
    session: { token: "session-token" },
    isAuthenticated: true,
    isLoading: false,
  };
}

async function waitUntil(predicate: () => boolean, timeout = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
  throw new Error("waitUntil timeout");
}

function renderApp(path: string): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    );
  });
  return { container, root };
}

describe("PAGE-006 App shell", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    setUnauthed();
    window.localStorage.clear();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it("renders login without bottom nav", async () => {
    const mounted = renderApp("/login");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeNull();
    expect(mounted.container.querySelector('button[aria-label="For You"]')).toBeNull();
    expect(mounted.container.querySelector(".elix-app-shell")).toBeTruthy();
  });

  it("renders register without authenticated chrome", async () => {
    const mounted = renderApp("/register");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Create Account");
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeNull();
  });

  it("sends unauthenticated /feed to login", async () => {
    const mounted = renderApp("/feed");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeNull();
  });

  it("opens auth callback without bottom nav", async () => {
    window.history.replaceState({}, "", "/auth/callback?token=verify-token");
    const mounted = renderApp("/auth/callback?token=verify-token");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("Auth Callback"));
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeNull();
  });

  it("opens forgot password without bottom nav", async () => {
    const mounted = renderApp("/forgot-password");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Forgot Password");
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeNull();
  });

  it("keeps reset-password token in the route and hides chrome", async () => {
    const mounted = renderApp("/reset-password?token=reset-token-1");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Reset Password");
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeNull();
    expect(mounted.container.querySelector("h1")?.textContent).toBe("Reset Password");
  });

  it("bounces authenticated login to feed with top and bottom nav", async () => {
    setAuthed();
    const mounted = renderApp("/login");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("feed-page"));
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
    expect(mounted.container.querySelector('button[aria-label="For You"]')).toBeTruthy();
    expect(mounted.container.querySelector('button[aria-label="LIVE"]')).toBeTruthy();
    expect(mounted.container.querySelector('button[aria-current="page"]')?.getAttribute("aria-label")).toBe("Home");
  });

  it("hides top nav on STEM and keeps bottom nav", async () => {
    setAuthed();
    const mounted = renderApp("/stem");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("stem-page"));
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
    expect(mounted.container.querySelector('button[aria-label="For You"]')).toBeNull();
  });

  it("hides bottom nav on create, watch, inbox thread, and call", async () => {
    setAuthed();
    for (const [path, marker] of [
      ["/create", "create-page"],
      ["/watch/room-1", "watch-page"],
      ["/inbox/thread-1", "thread-page"],
      ["/call", "call-page"],
    ] as const) {
      act(() => {
        root?.unmount();
        container?.remove();
      });
      const mounted = renderApp(path);
      root = mounted.root;
      container = mounted.container;
      await waitUntil(() => (mounted.container.textContent || "").includes(marker));
      expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeNull();
    }
  });

  it("does not show bottom nav on forgot/reset when a leftover session exists", async () => {
    setAuthed();
    const mounted = renderApp("/forgot-password");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Forgot Password");
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeNull();
  });

  it("sends unknown authenticated routes to feed", async () => {
    setAuthed();
    const mounted = renderApp("/this-route-does-not-exist");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("feed-page"));
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
  });

  it("keeps one app shell and does not duplicate bottom nav", async () => {
    setAuthed();
    const mounted = renderApp("/feed");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("feed-page"));
    expect(mounted.container.querySelectorAll(".elix-app-shell").length).toBe(1);
    expect(mounted.container.querySelectorAll('nav[aria-label="Main navigation"]').length).toBe(1);
  });

  it("redirects non-admin away from admin", async () => {
    setAuthed(false);
    const mounted = renderApp("/admin");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("feed-page"));
    expect(mounted.container.textContent).not.toContain("admin-page");
  });
});
