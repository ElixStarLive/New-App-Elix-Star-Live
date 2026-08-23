import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useCallStore } from "@/store/useCallStore";

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
    disconnect: vi.fn(),
    isConnected: () => false,
    getCurrentRoomId: () => null,
    send: vi.fn(),
    reconnectOnForeground: vi.fn(),
  },
}));

vi.mock("@/lib/pushRegister", () => ({
  registerPushToken: async () => undefined,
}));

vi.mock("@/features/iap/iapApi", () => ({
  initializeCoinIap: async () => true,
  reconcileOwnedCoinPurchases: async () => 0,
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: async () => undefined })),
    minimizeApp: vi.fn(async () => undefined),
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => "web",
  },
}));

vi.mock("@/features/auth/authSession", () => ({
  authVerifyEmail: async () => ({
    ok: true as const,
    kind: "session" as const,
    accessToken: "t",
    user: { id: "u", email: "a@b.co" },
    alreadyConfirmed: false,
  }),
  authForgotPassword: async () => ({ ok: true }),
  authResetPassword: async () => ({ ok: true }),
}));

vi.mock("@/pages/VideoFeed", () => ({ default: () => <div>feed-page</div> }));
vi.mock("@/pages/StemFeed", () => ({ default: () => <div>stem-page</div> }));
vi.mock("@/pages/Create", () => ({ default: () => <div>create-page</div> }));
vi.mock("@/pages/ChatThread", () => ({ default: () => <div>thread-page</div> }));
vi.mock("@/pages/FriendsFeed", () => ({ default: () => <div>friends-page</div> }));
vi.mock("@/pages/OwnProfile", () => ({ default: () => <div>own-profile-page</div> }));
vi.mock("@/pages/Profile", () => ({ default: () => <div>profile-page</div> }));
vi.mock("@/pages/Inbox", () => ({ default: () => <div>inbox-page</div> }));
vi.mock("@/pages/LiveDiscover", () => ({ default: () => <div>live-discover-page</div> }));
vi.mock("@/pages/VideoCall", () => ({ default: () => <div>call-page</div> }));
vi.mock("@/pages/admin/Dashboard", () => ({ default: () => <div>admin-page</div> }));
vi.mock("@/pages/admin/Users", () => ({ default: () => <div>admin-users-page</div> }));
vi.mock("@/pages/admin/Reports", () => ({ default: () => <div>admin-reports-page</div> }));
vi.mock("@/pages/admin/Economy", () => ({ default: () => <div>admin-economy-page</div> }));
vi.mock("@/pages/admin/Monetisation", () => ({ default: () => <div>admin-monetisation-page</div> }));
vi.mock("@/pages/admin/Purchases", () => ({ default: () => <div>admin-purchases-page</div> }));
vi.mock("@/pages/admin/Withdrawals", () => ({ default: () => <div>admin-withdrawals-page</div> }));
vi.mock("@/pages/admin/RisingStars", () => ({ default: () => <div>admin-rising-stars-page</div> }));
vi.mock("@/pages/admin/Progression", () => ({ default: () => <div>admin-progression-page</div> }));
vi.mock("@/pages/Settings", () => ({ default: () => <div>settings-page</div> }));
vi.mock("@/pages/settings/SafetyCenter", () => ({ default: () => <div>safety-center-page</div> }));
vi.mock("@/pages/settings/SecuritySettings", () => ({ default: () => <div>security-settings-page</div> }));
vi.mock("@/pages/settings/NotificationSettings", () => ({ default: () => <div>notification-settings-page</div> }));
vi.mock("@/pages/settings/BlockedAccounts", () => ({ default: () => <div>blocked-accounts-page</div> }));
vi.mock("@/pages/CreatorPayout", () => ({ default: () => <div>creator-payout-page</div> }));
vi.mock("@/pages/Report", () => ({ default: () => <div>report-page</div> }));
vi.mock("@/pages/engagement/EngagementHub", () => ({ default: () => <div>engagement-hub-page</div> }));
vi.mock("@/pages/engagement/EngagementMissions", () => ({ default: () => <div>engagement-missions-page</div> }));
vi.mock("@/pages/engagement/EngagementFanLevel", () => ({ default: () => <div>engagement-fan-level-page</div> }));
vi.mock("@/pages/engagement/EngagementMvp", () => ({ default: () => <div>engagement-mvp-page</div> }));
vi.mock("@/pages/engagement/EngagementAchievements", () => ({ default: () => <div>engagement-achievements-page</div> }));
vi.mock("@/pages/engagement/EngagementRewards", () => ({ default: () => <div>engagement-rewards-page</div> }));
vi.mock("@/pages/engagement/EngagementDailyLogin", () => ({ default: () => <div>engagement-daily-login-page</div> }));
vi.mock("@/pages/engagement/EngagementCollections", () => ({ default: () => <div>engagement-collections-page</div> }));
vi.mock("@/pages/RisingStars", () => ({ default: () => <div>rising-stars-page</div> }));
vi.mock("@/pages/RisingStarsChallenge", () => ({ default: () => <div>rising-stars-challenge-page</div> }));

const engagementFlag = vi.hoisted(() => ({ enabled: true }));
vi.mock("@/config/engagementFlags", () => ({
  isEngagementHubEnabled: () => engagementFlag.enabled,
}));
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
    engagementFlag.enabled = true;
    window.localStorage.clear();
    useCallStore.getState().reset();
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    window.__ELIX_ENV = {
      ...(window.__ELIX_ENV ?? {}),
      VITE_EMAIL_CONFIGURED: "true",
    };
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
    container = undefined;
    if (window.__ELIX_ENV) {
      delete window.__ELIX_ENV.VITE_EMAIL_CONFIGURED;
    }
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

  it("opens public /legal/ugc without login", async () => {
    const mounted = renderApp("/legal/ugc");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "User-Generated Content Policy");
    expect(mounted.container.textContent).toContain("Licence Grant");
    expect(mounted.container.textContent).toContain("DMCA Policy");
    expect(mounted.container.querySelector("h1")?.textContent).not.toBe("Login");
    expect(mounted.container.querySelector("iframe")).toBeNull();
  });

  it("opens authenticated /legal/ugc on the Legal UGC owner", async () => {
    setAuthed();
    const mounted = renderApp("/legal/ugc");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "User-Generated Content Policy");
    expect(mounted.container.textContent).toContain("About UGC");
  });

  it("opens public /terms without login", async () => {
    const mounted = renderApp("/terms");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Terms of Service");
    expect(mounted.container.textContent).toContain("1. About the Service");
    expect(mounted.container.textContent).toContain("27. Contact");
    expect(mounted.container.querySelector("h1")?.textContent).not.toBe("Login");
    expect(mounted.container.querySelector("iframe")).toBeNull();
  });

  it("opens authenticated /terms on the PAGE-057 owner", async () => {
    setAuthed();
    const mounted = renderApp("/terms");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Terms of Service");
    expect(mounted.container.textContent).toContain("Last updated: July 23, 2026");
    expect(mounted.container.textContent).toContain("Stripe only");
  });

  it("opens public /privacy without login", async () => {
    const mounted = renderApp("/privacy");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Privacy Policy");
    expect(mounted.container.textContent).toContain("1. Information We Collect");
    expect(mounted.container.textContent).toContain("14. Contact Us");
    expect(mounted.container.querySelector("h1")?.textContent).not.toBe("Login");
    expect(mounted.container.querySelector("iframe")).toBeNull();
  });

  it("opens authenticated /privacy on the PAGE-058 owner", async () => {
    setAuthed();
    const mounted = renderApp("/privacy");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Privacy Policy");
    expect(mounted.container.textContent).toContain("Last updated: February 20, 2026");
    expect(mounted.container.textContent).toContain("Go to Settings");
  });

  it("opens public /copyright without login", async () => {
    const mounted = renderApp("/copyright");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Copyright Notice");
    expect(mounted.container.textContent).toContain("© 2026 Elix Star Live Ltd. All rights reserved.");
    expect(mounted.container.textContent).toContain("Report Copyright Infringement");
    expect(mounted.container.querySelector("h1")?.textContent).not.toBe("Login");
    expect(mounted.container.querySelector("iframe")).toBeNull();
  });

  it("opens authenticated /copyright on the PAGE-059 owner", async () => {
    setAuthed();
    const mounted = renderApp("/copyright");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Copyright Notice");
    expect(mounted.container.textContent).toContain("dmca@elixstarlive.com");
    expect(mounted.container.textContent).toContain("DMCA Policy");
  });

  it("opens public /legal without login", async () => {
    const mounted = renderApp("/legal");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Legal");
    expect(mounted.container.textContent).toContain("Terms & Conditions");
    expect(mounted.container.textContent).toContain("Copyright Notice");
    expect(mounted.container.textContent).toContain("UGC Disclaimer");
    expect(mounted.container.textContent).toContain("dmca@elixstarlive.com");
    expect(mounted.container.querySelector("h1")?.textContent).not.toBe("Login");
    expect(mounted.container.querySelector("iframe")).toBeNull();
  });

  it("opens authenticated /legal on the PAGE-060 owner", async () => {
    setAuthed();
    const mounted = renderApp("/legal");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Legal");
    expect(mounted.container.textContent).toContain("Audio & Music Disclaimer");
    expect(mounted.container.textContent).toContain("support@elixstarlive.co.uk");
  });

  it("opens public /legal/audio without login", async () => {
    const mounted = renderApp("/legal/audio");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Audio & Music Disclaimer");
    expect(mounted.container.textContent).toContain("Audio Content");
    expect(mounted.container.textContent).toContain("Live Streaming Audio");
    expect(mounted.container.textContent).toContain("legal@elixstarlive.com");
    expect(mounted.container.querySelector("h1")?.textContent).not.toBe("Login");
    expect(mounted.container.querySelector("iframe")).toBeNull();
  });

  it("opens authenticated /legal/audio on the PAGE-061 owner", async () => {
    setAuthed();
    const mounted = renderApp("/legal/audio");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Audio & Music Disclaimer");
    expect(mounted.container.textContent).toContain("User Responsibility");
    expect(mounted.container.textContent).toContain("DMCA takedown notice");
  });

  it("opens public /legal/affiliate without login", async () => {
    const mounted = renderApp("/legal/affiliate");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Affiliate & Sponsored Content");
    expect(mounted.container.textContent).toContain("Disclosure");
    expect(mounted.container.textContent).toContain("Creator Responsibilities");
    expect(mounted.container.textContent).toContain("legal@elixstarlive.com");
    expect(mounted.container.querySelector("h1")?.textContent).not.toBe("Login");
    expect(mounted.container.querySelector("iframe")).toBeNull();
  });

  it("opens authenticated /legal/affiliate on the PAGE-063 owner", async () => {
    setAuthed();
    const mounted = renderApp("/legal/affiliate");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Affiliate & Sponsored Content");
    expect(mounted.container.textContent).toContain("Platform Partnerships");
    expect(mounted.container.textContent).toContain("User Protection");
  });

  it("opens public /legal/dmca without login", async () => {
    const mounted = renderApp("/legal/dmca");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "DMCA / Copyright Policy");
    expect(mounted.container.textContent).toContain("Copyright Infringement Notification");
    expect(mounted.container.textContent).toContain("dmca@elixstarlive.com");
    expect(mounted.container.textContent).toContain("Email DMCA Agent");
    expect(mounted.container.querySelector("h1")?.textContent).not.toBe("Login");
    expect(mounted.container.querySelector("iframe")).toBeNull();
  });

  it("opens authenticated /legal/dmca on the PAGE-064 owner", async () => {
    setAuthed();
    const mounted = renderApp("/legal/dmca");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "DMCA / Copyright Policy");
    expect(mounted.container.textContent).toContain("Counter-Notification");
    expect(mounted.container.textContent).toContain("Repeat Infringers");
  });

  it("opens public /legal/safety without login and does not open PAGE-041", async () => {
    const mounted = renderApp("/legal/safety");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Safety Centre");
    expect(mounted.container.textContent).toContain("Reporting Content");
    expect(mounted.container.textContent).toContain("safety@elixstarlive.com");
    expect(mounted.container.querySelector("h1")?.textContent).not.toBe("Login");
    expect(mounted.container.textContent).not.toContain("safety-center-page");
    expect(mounted.container.querySelector("iframe")).toBeNull();
  });

  it("opens authenticated /legal/safety on the PAGE-065 owner", async () => {
    setAuthed();
    const mounted = renderApp("/legal/safety");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Safety Centre");
    expect(mounted.container.textContent).toContain("Child Safety");
    expect(mounted.container.textContent).toContain("Emergency Resources");
    expect(mounted.container.textContent).not.toContain("safety-center-page");
  });

  it("opens public /legal/supplier without login", async () => {
    const mounted = renderApp("/legal/supplier");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Supplier Agreement");
    expect(mounted.container.textContent).toContain("Last updated: July 15, 2026");
    expect(mounted.container.textContent).toContain("1. Parties");
    expect(mounted.container.textContent).toContain("info@elixstarlive.co.uk");
    expect(mounted.container.querySelector("h1")?.textContent).not.toBe("Login");
    expect(mounted.container.querySelector("iframe")).toBeNull();
  });

  it("opens authenticated /legal/supplier on the PAGE-066 owner", async () => {
    setAuthed();
    const mounted = renderApp("/legal/supplier");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Supplier Agreement");
    expect(mounted.container.textContent).toContain("5. Pricing, Invoices & Payment");
    expect(mounted.container.textContent).toContain("11. Contact");
    expect(mounted.container.textContent).toContain("support@elixstarlive.co.uk");
  });

  it("opens public /guidelines without login", async () => {
    const mounted = renderApp("/guidelines");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Community Guidelines");
    expect(mounted.container.textContent).toContain("Last updated: February 4, 2026");
    expect(mounted.container.textContent).toContain("Be Kind and Respectful");
    expect(mounted.container.textContent).toContain("Report a Violation");
    expect(mounted.container.querySelector("h1")?.textContent).not.toBe("Login");
    expect(mounted.container.querySelector("iframe")).toBeNull();
  });

  it("opens authenticated /guidelines on the PAGE-067 owner", async () => {
    setAuthed();
    const mounted = renderApp("/guidelines");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Community Guidelines");
    expect(mounted.container.textContent).toContain("Keep Content Safe");
    expect(mounted.container.textContent).toContain("Consequences");
    expect(mounted.container.textContent).toContain("Go to Settings");
  });

  it("opens public /how-it-works without login", async () => {
    const mounted = renderApp("/how-it-works");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "How the app works");
    expect(mounted.container.textContent).toContain("Last updated: August 5, 2026");
    expect(mounted.container.textContent).toContain("Main tabs");
    expect(mounted.container.textContent).toContain("Open Engagement Hub");
    expect(mounted.container.querySelector("h1")?.textContent).not.toBe("Login");
    expect(mounted.container.querySelector("iframe")).toBeNull();
  });

  it("opens authenticated /how-it-works on the PAGE-068 owner", async () => {
    setAuthed();
    const mounted = renderApp("/how-it-works");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "How the app works");
    expect(mounted.container.textContent).toContain("Creator monetisation (how you earn)");
    expect(mounted.container.textContent).toContain("Help & Support");
    expect(mounted.container.textContent).toContain("Community Guidelines");
  });

  it("opens public /support without login", async () => {
    const mounted = renderApp("/support");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Help & Support");
    expect(mounted.container.textContent).toContain("Quick Links");
    expect(mounted.container.textContent).toContain("Frequently Asked Questions");
    expect(mounted.container.textContent).toContain("support@elixstarlive.co.uk");
    expect(mounted.container.querySelector("h1")?.textContent).not.toBe("Login");
    expect(mounted.container.querySelector("iframe")).toBeNull();
    expect(mounted.container.querySelector("form")).toBeNull();
  });

  it("opens authenticated /support on the PAGE-069 owner", async () => {
    setAuthed();
    const mounted = renderApp("/support");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Help & Support");
    expect(mounted.container.textContent).toContain("How do I earn coins?");
    expect(mounted.container.textContent).toContain("Copyright Policy");
    expect(mounted.container.textContent).toContain("Email us directly");
    expect(mounted.container.querySelector("iframe")).toBeNull();
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
      ["/live", "live-discover-page"],
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

  it("sends unauthenticated /admin to login without admin data", async () => {
    const mounted = renderApp("/admin");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("admin-page");
    expect(mounted.container.textContent).not.toContain("Daily Active Users");
  });

  it("opens authenticated admin /admin on the PAGE-070 owner", async () => {
    setAuthed(true);
    const mounted = renderApp("/admin");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("admin-page"));
    expect(mounted.container.textContent).toContain("admin-page");
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
  });

  it("sends unauthenticated /admin/users to login without user-list data", async () => {
    const mounted = renderApp("/admin/users");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("admin-users-page");
    expect(mounted.container.textContent).not.toContain("User Management");
  });

  it("opens authenticated admin /admin/users on the PAGE-071 owner", async () => {
    setAuthed(true);
    const mounted = renderApp("/admin/users");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("admin-users-page"));
    expect(mounted.container.textContent).toContain("admin-users-page");
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
  });

  it("redirects non-admin away from /admin/users", async () => {
    setAuthed(false);
    const mounted = renderApp("/admin/users");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("feed-page"));
    expect(mounted.container.textContent).not.toContain("admin-users-page");
  });

  it("sends unauthenticated /admin/reports to login without report data", async () => {
    const mounted = renderApp("/admin/reports");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("admin-reports-page");
    expect(mounted.container.textContent).not.toContain("Reports Queue");
  });

  it("opens authenticated admin /admin/reports on the PAGE-072 owner", async () => {
    setAuthed(true);
    const mounted = renderApp("/admin/reports");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("admin-reports-page"));
    expect(mounted.container.textContent).toContain("admin-reports-page");
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
  });

  it("redirects non-admin away from /admin/reports", async () => {
    setAuthed(false);
    const mounted = renderApp("/admin/reports");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("feed-page"));
    expect(mounted.container.textContent).not.toContain("admin-reports-page");
  });

  it("sends unauthenticated /admin/economy to login without economy data", async () => {
    const mounted = renderApp("/admin/economy");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("admin-economy-page");
    expect(mounted.container.textContent).not.toContain("Economy Controls");
    expect(mounted.container.textContent).not.toContain("Gifts Catalog");
  });

  it("opens authenticated admin /admin/economy on the PAGE-073 owner", async () => {
    setAuthed(true);
    const mounted = renderApp("/admin/economy");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("admin-economy-page"));
    expect(mounted.container.textContent).toContain("admin-economy-page");
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
  });

  it("redirects non-admin away from /admin/economy", async () => {
    setAuthed(false);
    const mounted = renderApp("/admin/economy");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("feed-page"));
    expect(mounted.container.textContent).not.toContain("admin-economy-page");
  });

  it("sends unauthenticated /admin/monetisation to login without monetisation data", async () => {
    const mounted = renderApp("/admin/monetisation");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("admin-monetisation-page");
    expect(mounted.container.textContent).not.toContain("Ops dashboard");
    expect(mounted.container.textContent).not.toContain("Gift creator %");
  });

  it("opens authenticated admin /admin/monetisation on the PAGE-074 owner", async () => {
    setAuthed(true);
    const mounted = renderApp("/admin/monetisation");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("admin-monetisation-page"));
    expect(mounted.container.textContent).toContain("admin-monetisation-page");
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
  });

  it("redirects non-admin away from /admin/monetisation", async () => {
    setAuthed(false);
    const mounted = renderApp("/admin/monetisation");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("feed-page"));
    expect(mounted.container.textContent).not.toContain("admin-monetisation-page");
  });

  it("sends unauthenticated /admin/purchases to login without purchase data", async () => {
    const mounted = renderApp("/admin/purchases");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("admin-purchases-page");
    expect(mounted.container.textContent).not.toContain("Coin IAP");
    expect(mounted.container.textContent).not.toContain("Shop (Stripe)");
  });

  it("opens authenticated admin /admin/purchases on the PAGE-075 owner", async () => {
    setAuthed(true);
    const mounted = renderApp("/admin/purchases");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("admin-purchases-page"));
    expect(mounted.container.textContent).toContain("admin-purchases-page");
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
  });

  it("redirects non-admin away from /admin/purchases", async () => {
    setAuthed(false);
    const mounted = renderApp("/admin/purchases");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("feed-page"));
    expect(mounted.container.textContent).not.toContain("admin-purchases-page");
  });

  it("sends unauthenticated /admin/withdrawals to login without withdrawal data", async () => {
    const mounted = renderApp("/admin/withdrawals");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("admin-withdrawals-page");
    expect(mounted.container.textContent).not.toContain("Manual review only");
    expect(mounted.container.textContent).not.toContain("Mark paid manually");
  });

  it("opens authenticated admin /admin/withdrawals on the PAGE-076 owner", async () => {
    setAuthed(true);
    const mounted = renderApp("/admin/withdrawals");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("admin-withdrawals-page"));
    expect(mounted.container.textContent).toContain("admin-withdrawals-page");
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
  });

  it("redirects non-admin away from /admin/withdrawals", async () => {
    setAuthed(false);
    const mounted = renderApp("/admin/withdrawals");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("feed-page"));
    expect(mounted.container.textContent).not.toContain("admin-withdrawals-page");
  });

  it("sends unauthenticated /admin/rising-stars to login without Rising Stars admin data", async () => {
    const mounted = renderApp("/admin/rising-stars");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("admin-rising-stars-page");
    expect(mounted.container.textContent).not.toContain("Rising Stars Admin");
    expect(mounted.container.textContent).not.toContain("Snapshot qualifier");
  });

  it("opens authenticated admin /admin/rising-stars on the PAGE-077 owner", async () => {
    setAuthed(true);
    const mounted = renderApp("/admin/rising-stars");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("admin-rising-stars-page"));
    expect(mounted.container.textContent).toContain("admin-rising-stars-page");
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
  });

  it("redirects non-admin away from /admin/rising-stars", async () => {
    setAuthed(false);
    const mounted = renderApp("/admin/rising-stars");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("feed-page"));
    expect(mounted.container.textContent).not.toContain("admin-rising-stars-page");
  });

  it("sends unauthenticated /admin/progression to login without Progression admin data", async () => {
    const mounted = renderApp("/admin/progression");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("admin-progression-page");
    expect(mounted.container.textContent).not.toContain("Starter Coins & XP");
    expect(mounted.container.textContent).not.toContain("Feature flags");
  });

  it("opens authenticated admin /admin/progression on the PAGE-078 owner", async () => {
    setAuthed(true);
    const mounted = renderApp("/admin/progression");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("admin-progression-page"));
    expect(mounted.container.textContent).toContain("admin-progression-page");
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
  });

  it("redirects non-admin away from /admin/progression", async () => {
    setAuthed(false);
    const mounted = renderApp("/admin/progression");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("feed-page"));
    expect(mounted.container.textContent).not.toContain("admin-progression-page");
  });

  it("redirects non-admin away from admin", async () => {
    setAuthed(false);
    const mounted = renderApp("/admin");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("feed-page"));
    expect(mounted.container.textContent).not.toContain("admin-page");
  });

  it("sends unauthenticated /settings to login", async () => {
    const mounted = renderApp("/settings");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("settings-page");
  });

  it("opens authenticated /settings on the Settings owner", async () => {
    setAuthed();
    const mounted = renderApp("/settings");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("settings-page"));
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
  });

  it("sends unauthenticated /settings/safety to login", async () => {
    const mounted = renderApp("/settings/safety");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("safety-center-page");
  });

  it("opens authenticated /settings/safety on the Safety Center owner", async () => {
    setAuthed();
    const mounted = renderApp("/settings/safety");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("safety-center-page"));
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
  });

  it("sends unauthenticated /settings/security to login", async () => {
    const mounted = renderApp("/settings/security");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("security-settings-page");
  });

  it("opens authenticated /settings/security on the Security owner", async () => {
    setAuthed();
    const mounted = renderApp("/settings/security");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("security-settings-page"));
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
  });

  it("sends unauthenticated /settings/notifications to login", async () => {
    const mounted = renderApp("/settings/notifications");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("notification-settings-page");
  });

  it("opens authenticated /settings/notifications on the Notification Settings owner", async () => {
    setAuthed();
    const mounted = renderApp("/settings/notifications");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("notification-settings-page"));
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
  });

  it("sends unauthenticated /settings/blocked to login", async () => {
    const mounted = renderApp("/settings/blocked");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("blocked-accounts-page");
  });

  it("opens authenticated /settings/blocked on the Blocked Accounts owner", async () => {
    setAuthed();
    const mounted = renderApp("/settings/blocked");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("blocked-accounts-page"));
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
  });

  it("sends unauthenticated /settings/payout to login", async () => {
    const mounted = renderApp("/settings/payout");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("creator-payout-page");
  });

  it("opens authenticated /settings/payout on the Creator Payout owner", async () => {
    setAuthed();
    const mounted = renderApp("/settings/payout");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("creator-payout-page"));
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
  });

  it("sends unauthenticated /report to login", async () => {
    const mounted = renderApp("/report");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("report-page");
  });

  it("opens authenticated /report on the Report owner", async () => {
    setAuthed();
    const mounted = renderApp("/report");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("report-page"));
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
  });

  it("sends unauthenticated /engagement to login", async () => {
    const mounted = renderApp("/engagement");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("engagement-hub-page");
  });

  it("opens authenticated /engagement on the Engagement Hub owner when the flag is on", async () => {
    setAuthed();
    const mounted = renderApp("/engagement");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("engagement-hub-page"));
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
  });

  it("sends unauthenticated /engagement/missions to login", async () => {
    const mounted = renderApp("/engagement/missions");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("engagement-missions-page");
  });

  it("opens authenticated /engagement/missions when the flag is on", async () => {
    setAuthed();
    const mounted = renderApp("/engagement/missions");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("engagement-missions-page"));
  });

  it("opens authenticated /engagement/missions when the flag is off (OLD always available)", async () => {
    engagementFlag.enabled = false;
    setAuthed();
    const mounted = renderApp("/engagement/missions");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("engagement-missions-page"));
  });

  it("sends unauthenticated /engagement/fan-level to login", async () => {
    const mounted = renderApp("/engagement/fan-level");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("engagement-fan-level-page");
  });

  it("opens authenticated /engagement/fan-level when the flag is on", async () => {
    setAuthed();
    const mounted = renderApp("/engagement/fan-level");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("engagement-fan-level-page"));
  });

  it("opens authenticated /engagement/fan-level when the flag is off (OLD always available)", async () => {
    engagementFlag.enabled = false;
    setAuthed();
    const mounted = renderApp("/engagement/fan-level");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("engagement-fan-level-page"));
  });

  it("sends unauthenticated /engagement/mvp to login", async () => {
    const mounted = renderApp("/engagement/mvp");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("engagement-mvp-page");
  });

  it("opens authenticated /engagement/mvp when the flag is on", async () => {
    setAuthed();
    const mounted = renderApp("/engagement/mvp");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("engagement-mvp-page"));
  });

  it("opens authenticated /engagement/mvp when the flag is off (OLD always available)", async () => {
    engagementFlag.enabled = false;
    setAuthed();
    const mounted = renderApp("/engagement/mvp");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("engagement-mvp-page"));
  });

  it("sends unauthenticated /engagement/achievements to login", async () => {
    const mounted = renderApp("/engagement/achievements");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("engagement-achievements-page");
  });

  it("opens authenticated /engagement/achievements when the flag is on", async () => {
    setAuthed();
    const mounted = renderApp("/engagement/achievements");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("engagement-achievements-page"));
  });

  it("opens authenticated /engagement/achievements when the flag is off (OLD always available)", async () => {
    engagementFlag.enabled = false;
    setAuthed();
    const mounted = renderApp("/engagement/achievements");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("engagement-achievements-page"));
  });

  it("sends unauthenticated /engagement/rewards to login", async () => {
    const mounted = renderApp("/engagement/rewards");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("engagement-rewards-page");
  });

  it("opens authenticated /engagement/rewards when the flag is on", async () => {
    setAuthed();
    const mounted = renderApp("/engagement/rewards");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("engagement-rewards-page"));
  });

  it("opens authenticated /engagement/rewards when the flag is off (OLD always available)", async () => {
    engagementFlag.enabled = false;
    setAuthed();
    const mounted = renderApp("/engagement/rewards");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("engagement-rewards-page"));
  });

  it("sends unauthenticated /engagement/daily-login to login", async () => {
    const mounted = renderApp("/engagement/daily-login");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("engagement-daily-login-page");
  });

  it("opens authenticated /engagement/daily-login when the flag is on", async () => {
    setAuthed();
    const mounted = renderApp("/engagement/daily-login");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("engagement-daily-login-page"));
  });

  it("opens authenticated /engagement/daily-login when the flag is off (OLD always available)", async () => {
    engagementFlag.enabled = false;
    setAuthed();
    const mounted = renderApp("/engagement/daily-login");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("engagement-daily-login-page"));
  });

  it("sends unauthenticated /engagement/collections to login", async () => {
    const mounted = renderApp("/engagement/collections");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("engagement-collections-page");
  });

  it("opens authenticated /engagement/collections when the flag is on", async () => {
    setAuthed();
    const mounted = renderApp("/engagement/collections");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("engagement-collections-page"));
  });

  it("opens authenticated /engagement/collections when the flag is off (OLD always available)", async () => {
    engagementFlag.enabled = false;
    setAuthed();
    const mounted = renderApp("/engagement/collections");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("engagement-collections-page"));
  });

  it("sends unauthenticated /rising-stars to login", async () => {
    const mounted = renderApp("/rising-stars");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("rising-stars-page");
  });

  it("opens authenticated /rising-stars on the Rising Stars owner", async () => {
    setAuthed();
    const mounted = renderApp("/rising-stars");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("rising-stars-page"));
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
  });

  it("sends unauthenticated /rising-stars/challenge/:challengeId to login", async () => {
    const mounted = renderApp("/rising-stars/challenge/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => mounted.container.querySelector("h1")?.textContent === "Login");
    expect(mounted.container.textContent).not.toContain("rising-stars-challenge-page");
  });

  it("opens authenticated /rising-stars/challenge/:challengeId on the PAGE-056 owner", async () => {
    setAuthed();
    const mounted = renderApp("/rising-stars/challenge/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("rising-stars-challenge-page"));
    expect(mounted.container.querySelector('nav[aria-label="Main navigation"]')).toBeTruthy();
  });

  it("opens authenticated /engagement when the flag is off (OLD always available)", async () => {
    engagementFlag.enabled = false;
    setAuthed();
    const mounted = renderApp("/engagement");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("engagement-hub-page"));
  });

  it("can still show IncomingCallModal over Settings", async () => {
    setAuthed();
    const mounted = renderApp("/settings");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("settings-page"));
    act(() => {
      useCallStore.getState().setIncoming({
        callId: "call-settings",
        remoteUser: { id: "u2", username: "Caller", avatar: null },
        livekitUrl: "https://livekit.example",
        livekitToken: "tok",
        roomName: "room-1",
      });
    });
    await waitUntil(() => (mounted.container.textContent || "").includes("Incoming video call"));
    expect(mounted.container.querySelector('button[aria-label="Accept call"]')).toBeTruthy();
    expect(mounted.container.textContent).toContain("settings-page");
  });

  it("shows the offline banner while the shell is mounted", async () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    const mounted = renderApp("/login");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("No internet connection"));
    expect(mounted.container.querySelector(".elix-app-shell")).toBeTruthy();
  });

  it("shows an incoming call over For You", async () => {
    setAuthed();
    const mounted = renderApp("/feed");
    root = mounted.root;
    container = mounted.container;
    await waitUntil(() => (mounted.container.textContent || "").includes("feed-page"));
    act(() => {
      useCallStore.getState().setIncoming({
        callId: "call-1",
        remoteUser: { id: "u2", username: "Caller", avatar: null },
        livekitUrl: "https://livekit.example",
        livekitToken: "tok",
        roomName: "room-1",
      });
    });
    await waitUntil(() => (mounted.container.textContent || "").includes("Incoming video call"));
    expect(mounted.container.querySelector('button[aria-label="Accept call"]')).toBeTruthy();
    expect(mounted.container.querySelector('button[aria-label="Decline call"]')).toBeTruthy();
    expect(mounted.container.textContent).toContain("feed-page");
  });


});
