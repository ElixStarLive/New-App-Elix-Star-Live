import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserPublic } from "@shared/contracts";

const api = vi.hoisted(() => ({
  apiFetchPublicProfile: vi.fn(),
  apiFetchPublicProfileById: vi.fn(),
  apiFetchPublicShop: vi.fn(),
  apiFetchPublicStories: vi.fn(),
  apiFetchPublicTabPage: vi.fn(),
  apiFollowPublicUser: vi.fn(),
  apiUnfollowPublicUser: vi.fn(),
  apiRegisterPublicProfileView: vi.fn(),
  apiBlockUser: vi.fn(),
  isProfileUserId: (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  isOwnPublicRouteKey: (routeKey: string, me: { id: string; username?: string | null } | null | undefined) => {
    if (!me?.id || !routeKey.trim()) return false;
    const key = routeKey.trim().replace(/^@+/, "");
    if (me.id === key) return true;
    const username = String(me.username ?? "")
      .trim()
      .replace(/^@+/, "");
    return Boolean(username) && username.toLowerCase() === key.toLowerCase();
  },
  publicProfileEmailLine: (username: string) => {
    const handle = username.replace(/^@+/, "").trim();
    return handle ? `${handle}@` : "";
  },
}));

const chat = vi.hoisted(() => ({
  apiEnsureDmThread: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/features/profile/publicProfileApi", () => api);
vi.mock("@/features/chat/chatApi", () => chat);
vi.mock("@/lib/videoCollectionEvents", () => ({
  subscribeVideoCollection: () => () => undefined,
}));
vi.mock("@/lib/wsClient", () => ({
  wsClient: { on: vi.fn(), off: vi.fn() },
}));
vi.mock("@/features/feed/livePresence", () => ({
  parseLiveStartedCard: () => null,
  liveEndedKeys: () => [],
}));

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (selector?: (state: { user: { id: string; username: string } }) => unknown) => {
    const state = { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", username: "viewer" } };
    return selector ? selector(state) : state;
  },
}));

import Profile from "./Profile";
import { namedHardwareBackTarget } from "@/lib/settingsNav";

const target: UserPublic = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  username: "creator",
  displayName: "Creator Name",
  avatarUrl: "https://cdn.example/b.jpg",
  bio: "Public bio",
  isVerified: true,
  followerCount: 5,
  followingCount: 2,
  likeCount: 9,
  viewCount: 3,
  isLive: false,
  isFollowing: false,
};

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}${location.search}`}</div>;
}

function renderPublic(entry = `/profile/${target.id}`) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/profile" element={<LocationProbe />} />
          <Route path="/profile/:userId" element={<Profile />} />
          <Route path="/profile/:userId/followers" element={<LocationProbe />} />
          <Route path="/profile/:userId/following" element={<LocationProbe />} />
          <Route path="/video/:videoId" element={<LocationProbe />} />
          <Route path="/watch/:roomId" element={<LocationProbe />} />
          <Route path="/inbox/:threadId" element={<LocationProbe />} />
          <Route path="/feed" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  for (const fn of Object.values(api)) {
    if (typeof fn === "function" && "mockReset" in fn) fn.mockReset();
  }
  chat.apiEnsureDmThread.mockReset();
  api.apiFetchPublicStories.mockResolvedValue({ stories: [], error: null });
  api.apiFetchPublicShop.mockResolvedValue({ items: [], error: null });
  api.apiRegisterPublicProfileView.mockResolvedValue({ uniqueViews: 3, error: null });
  api.apiFetchPublicTabPage.mockResolvedValue({
    page: {
      videos: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          url: "https://cdn.example/v.mp4",
          thumbnail: "",
          duration: "0:10",
          user: {
            id: target.id,
            username: "creator",
            name: "Creator Name",
            avatar: target.avatarUrl ?? "",
            level: 1,
            isVerified: true,
            followers: 5,
            following: 2,
          },
          description: "public video",
          hashtags: [],
          music: null,
          stats: { views: 4, likes: 0, comments: 0, shares: 0, saves: 0 },
          createdAt: "2026-08-20T00:00:00.000Z",
          location: "",
          isLiked: false,
          isSaved: false,
          isFollowing: false,
          comments: [],
          quality: "",
          privacy: "public",
          engagementScore: 0,
        },
      ],
      nextCursor: null,
    },
    error: null,
  });
  api.apiFetchPublicProfile.mockResolvedValue({ profile: target, error: null });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("PAGE-025 public profile page", () => {
  it("redirects the session user's public route to own profile", async () => {
    const view = renderPublic("/profile/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("LOC /profile");
    expect(api.apiFetchPublicProfile).not.toHaveBeenCalled();
  });

  it("redirects own username route to PAGE-024 without loading public controls", async () => {
    const view = renderPublic("/profile/viewer");
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("LOC /profile");
    expect(api.apiFetchPublicProfile).not.toHaveBeenCalled();
  });

  it("hydrates another user's public profile and opens a video on PAGE-014", async () => {
    const view = renderPublic();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Creator Name");
    expect(container.textContent).toContain("Public bio");
    expect(container.textContent).toContain("Follow");
    expect(container.textContent).toContain("Message");
    expect(container.textContent).not.toContain("Settings");
    expect(container.textContent).not.toContain("No private videos");
    const card = container.querySelector("video")?.closest("button") as HTMLButtonElement | null;
    expect(card).toBeTruthy();
    await act(async () => {
      card?.click();
    });
    expect(container.textContent).toContain("LOC /video/11111111-1111-4111-8111-111111111111");
  });

  it("hands Message to an existing thread path", async () => {
    chat.apiEnsureDmThread.mockResolvedValue({ threadId: "thread-1", error: null });
    const view = renderPublic();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const buttons = Array.from(container.querySelectorAll("button"));
    const message = buttons.find((btn) => btn.textContent === "Message");
    await act(async () => {
      message?.click();
      await Promise.resolve();
    });
    expect(chat.apiEnsureDmThread).toHaveBeenCalledWith(target.id);
    expect(container.textContent).toContain("LOC /inbox/thread-1");
  });

  it("opens LIVE watch using the host user UUID as roomId", async () => {
    api.apiFetchPublicProfile.mockResolvedValue({ profile: { ...target, isLive: true }, error: null });
    const view = renderPublic();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const avatar = container.querySelector("[data-avatar-circle], img")?.closest("div.cursor-pointer") as HTMLDivElement | null
      ?? (container.querySelector(".cursor-pointer") as HTMLDivElement | null);
    expect(avatar).toBeTruthy();
    await act(async () => {
      avatar?.click();
    });
    expect(container.textContent).toContain(`LOC /watch/${target.id}`);
  });

  it("closes to For You and uses named hardware back", async () => {
    const view = renderPublic();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
    });
    const close = container.querySelector('[aria-label="Close"]') as HTMLButtonElement | null;
    await act(async () => {
      close?.click();
    });
    expect(container.textContent).toContain("LOC /feed");
    expect(namedHardwareBackTarget(`/profile/${target.id}`)).toBe("/feed");
  });

  it("shows a visible error for a missing user", async () => {
    api.apiFetchPublicProfile.mockResolvedValue({ profile: null, error: "User not found", status: 404 });
    const view = renderPublic();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("User not found");
    expect(container.textContent).not.toContain("Creator Name");
  });
});
