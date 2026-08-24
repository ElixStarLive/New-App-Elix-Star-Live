import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserPublic } from "@shared/contracts";

const api = vi.hoisted(() => ({
  apiFetchOwnProfile: vi.fn(),
  apiFetchOwnShop: vi.fn(),
  apiFetchOwnTabPage: vi.fn(),
  apiOwnHasActiveStory: vi.fn(),
  apiUploadOwnAvatar: vi.fn(),
  ownProfileEmailLine: (email: string | null | undefined, username: string) => {
    const trimmed = String(email ?? "").trim();
    if (trimmed.includes("@")) return `${trimmed.split("@")[0]}@`;
    return username ? `${username}@` : "";
  },
}));

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/features/profile/ownProfileApi", () => api);
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (selector?: (state: { user: { id: string; email: string; username: string }; updateUser: () => void }) => unknown) => {
    const state = {
      user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "info@elixstarlive.co.uk", username: "owner" },
      updateUser: vi.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

import OwnProfile from "./OwnProfile";
import { namedHardwareBackTarget } from "@/lib/settingsNav";

const me: UserPublic = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  username: "owner",
  displayName: "Owner Name",
  avatarUrl: "https://cdn.example/a.jpg",
  bio: "My bio",
  isVerified: true,
  followerCount: 12,
  followingCount: 7,
  likeCount: 40,
  viewCount: 9,
};

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}${location.search}`}</div>;
}

function renderOwn(entry = "/profile") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/profile" element={<OwnProfile />} />
          <Route path="/settings" element={<LocationProbe />} />
          <Route path="/edit-profile" element={<LocationProbe />} />
          <Route path="/ai-studio" element={<LocationProbe />} />
          <Route path="/upload" element={<LocationProbe />} />
          <Route path="/video/:videoId" element={<LocationProbe />} />
          <Route path="/feed" element={<LocationProbe />} />
          <Route path="/profile/:userId/followers" element={<LocationProbe />} />
          <Route path="/profile/:userId/following" element={<LocationProbe />} />
          <Route path="/creator/login-details" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  api.apiFetchOwnProfile.mockReset();
  api.apiFetchOwnShop.mockReset();
  api.apiFetchOwnTabPage.mockReset();
  api.apiOwnHasActiveStory.mockReset();
  api.apiUploadOwnAvatar.mockReset();
  api.apiOwnHasActiveStory.mockResolvedValue(false);
  api.apiFetchOwnShop.mockResolvedValue({ items: [], error: null });
  api.apiFetchOwnProfile.mockResolvedValue({ profile: me, error: null });
  api.apiFetchOwnTabPage.mockResolvedValue({ page: { videos: [], nextCursor: null }, error: null });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("PAGE-024 Own Profile page", () => {
  it("renders own identity, counts, tabs, and does not fetch a public user id", async () => {
    const view = renderOwn();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Profile");
    expect(container.textContent).toContain("Owner Name");
    expect(container.textContent).toContain("info@");
    expect(container.textContent).not.toContain("info@elixstarlive.co.uk");
    expect(container.textContent).toContain("My bio");
    expect(container.textContent).toContain("Following");
    expect(container.textContent).toContain("Followers");
    expect(container.textContent).toContain("Likes");
    expect(container.textContent).toContain("Views");
    expect(container.textContent).toContain("AI Studio");
    expect(container.textContent).toContain("Settings");
    expect(container.textContent).toContain("No videos yet");
    expect(container.querySelector('[aria-label="Private"]')).toBeTruthy();
    expect(api.apiFetchOwnProfile).toHaveBeenCalledTimes(1);
  });

  it("hands Settings, story plus, and video taps to named destinations", async () => {
    api.apiFetchOwnTabPage.mockResolvedValue({
      page: {
        videos: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            url: "https://cdn.example/v.mp4",
            thumbnail: "",
            duration: "0:10",
            user: {
              id: me.id,
              username: "owner",
              name: "Owner Name",
              avatar: me.avatarUrl ?? "",
              level: 1,
              isVerified: true,
              followers: 12,
              following: 7,
            },
            description: "hello",
            hashtags: [],
            music: null,
            stats: { views: 3, likes: 0, comments: 0, shares: 0, saves: 0 },
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
    const view = renderOwn();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const settings = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Settings"));
    expect(settings).toBeTruthy();
    await act(async () => {
      settings?.click();
    });
    expect(container.textContent).toContain("LOC /settings");
  });

  it("hands Elix Studio to PAGE-029", async () => {
    const view = renderOwn();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const studio = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Elix Studio"));
    expect(studio).toBeTruthy();
    await act(async () => {
      studio?.click();
    });
    expect(container.textContent).toContain("LOC /creator/login-details");
  });

  it("opens PAGE-014 from an own video card", async () => {
    api.apiFetchOwnTabPage.mockResolvedValue({
      page: {
        videos: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            url: "https://cdn.example/v.mp4",
            thumbnail: "",
            duration: "0:10",
            user: {
              id: me.id,
              username: "owner",
              name: "Owner Name",
              avatar: me.avatarUrl ?? "",
              level: 1,
              isVerified: true,
              followers: 12,
              following: 7,
            },
            description: "hello",
            hashtags: [],
            music: null,
            stats: { views: 3, likes: 0, comments: 0, shares: 0, saves: 0 },
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
    const view = renderOwn();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const card = container.querySelector("video")?.closest("button") as HTMLButtonElement | null;
    expect(card).toBeTruthy();
    await act(async () => {
      card?.click();
    });
    expect(container.textContent).toContain("LOC /video/11111111-1111-4111-8111-111111111111");
  });

  it("opens story upload from the plus control", async () => {
    const view = renderOwn();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const plus = container.querySelector('[aria-label="Add story"]') as HTMLButtonElement | null;
    expect(plus).toBeTruthy();
    await act(async () => {
      plus?.click();
    });
    expect(container.textContent).toContain("LOC /upload?type=story");
  });

  it("closes to For You and keeps /profile as a hardware-back root", async () => {
    const view = renderOwn();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
    });
    const close = container.querySelector('[aria-label="Close"]') as HTMLButtonElement | null;
    expect(close).toBeTruthy();
    await act(async () => {
      close?.click();
    });
    expect(container.textContent).toContain("LOC /feed");
    expect(namedHardwareBackTarget("/profile")).toBeNull();
  });

  it("shows a visible error when own profile fails", async () => {
    api.apiFetchOwnProfile.mockResolvedValue({ profile: null, error: "session_expired", status: 401 });
    const view = renderOwn();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("session_expired");
    expect(container.textContent).not.toContain("Owner Name");
  });
});
