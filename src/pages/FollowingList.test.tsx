import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserPublic } from "@shared/contracts";
import { showToast } from "@/lib/toast";

const api = vi.hoisted(() => ({
  apiFetchFollowing: vi.fn(),
  apiFollowFollowingRow: vi.fn(),
  apiUnfollowFollowingRow: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/features/profile/followingApi", () => api);
vi.mock("@/lib/followRelationshipEvents", () => ({
  subscribeFollowRelationship: () => () => undefined,
}));
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (selector?: (state: { user: { id: string } }) => unknown) => {
    const state = { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } };
    return selector ? selector(state) : state;
  },
}));

import FollowingList from "./FollowingList";
import { namedHardwareBackTarget } from "@/lib/settingsNav";

const followee: UserPublic = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  username: "star",
  displayName: "Star Name",
  avatarUrl: null,
  bio: "",
  isVerified: false,
  followerCount: 0,
  followingCount: 0,
  isFollowing: true,
};

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}`}</div>;
}

function renderFollowing(
  initialEntry: string | { pathname: string; state?: unknown } = "/profile/cccccccc-cccc-4ccc-8ccc-cccccccccccc/following",
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/profile/:userId/following" element={<FollowingList />} />
          <Route path="/profile/:userId" element={<LocationProbe />} />
          <Route path="/inbox" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  api.apiFetchFollowing.mockReset();
  api.apiFollowFollowingRow.mockReset();
  api.apiUnfollowFollowingRow.mockReset();
  api.apiFetchFollowing.mockResolvedValue({ users: [followee], error: null });
  api.apiUnfollowFollowingRow.mockResolvedValue({ ok: true });
  vi.mocked(showToast).mockClear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("PAGE-028 Following list page", () => {
  it("lists accounts the owner follows and unfollow uses the shared follow API", async () => {
    const view = renderFollowing();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Following");
    expect(container.textContent).toContain("Star Name");
    expect(container.textContent).toContain("@star");
    expect(container.textContent).not.toContain("No followers yet.");
    const unfollow = Array.from(container.querySelectorAll("button")).find((btn) => btn.textContent === "Following");
    await act(async () => {
      unfollow?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(api.apiUnfollowFollowingRow).toHaveBeenCalledWith(followee.id);
    // Public list: owner→star remains; only viewer→star flips to Follow.
    expect(container.textContent).toContain("Star Name");
    expect(Array.from(container.querySelectorAll("button")).some((btn) => btn.textContent === "Follow")).toBe(true);
  });

  it("removes the row when unfollowing from the viewer's own Following list", async () => {
    const view = renderFollowing("/profile/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/following");
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const unfollow = Array.from(container.querySelectorAll("button")).find((btn) => btn.textContent === "Following");
    await act(async () => {
      unfollow?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(api.apiUnfollowFollowingRow).toHaveBeenCalledWith(followee.id);
    expect(container.textContent).toContain("Not following anyone yet.");
    expect(container.textContent).not.toContain("Star Name");
  });

  it("shows the empty copy when the owner follows nobody", async () => {
    api.apiFetchFollowing.mockResolvedValue({ users: [], error: null });
    const view = renderFollowing();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Not following anyone yet.");
  });

  it("shows a visible error when the first load fails", async () => {
    api.apiFetchFollowing.mockResolvedValue({ users: [], error: "offline", status: 0 });
    const view = renderFollowing();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("offline");
    expect(container.textContent).not.toContain("Not following anyone yet.");
  });

  it("shows blocked/forbidden load errors without inventing rows", async () => {
    api.apiFetchFollowing.mockResolvedValue({
      users: [],
      error: "You cannot view this profile",
      status: 403,
    });
    const view = renderFollowing();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("You cannot view this profile");
  });

  it("toasts a stable follow failure message when the server rejects", async () => {
    api.apiUnfollowFollowingRow.mockResolvedValue({ ok: false, error: "forbidden" });
    const view = renderFollowing();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const unfollow = Array.from(container.querySelectorAll("button")).find((btn) => btn.textContent === "Following");
    await act(async () => {
      unfollow?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(showToast).toHaveBeenCalledWith("Could not update follow");
  });

  it("closes to the source profile and uses named hardware back", async () => {
    const view = renderFollowing();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
    });
    const back = container.querySelector('[aria-label="Back"]') as HTMLButtonElement | null;
    await act(async () => {
      back?.click();
    });
    expect(container.textContent).toContain("LOC /profile/cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    expect(namedHardwareBackTarget("/profile/cccccccc-cccc-4ccc-8ccc-cccccccccccc/following")).toBe(
      "/profile/cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    );
  });

  it("honors Inbox returnTo on close and hardware back", async () => {
    const view = renderFollowing({
      pathname: "/profile/cccccccc-cccc-4ccc-8ccc-cccccccccccc/following",
      state: { returnTo: "/inbox" },
    });
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
    });
    const back = container.querySelector('[aria-label="Back"]') as HTMLButtonElement | null;
    await act(async () => {
      back?.click();
    });
    expect(container.textContent).toContain("LOC /inbox");
    expect(
      namedHardwareBackTarget("/profile/cccccccc-cccc-4ccc-8ccc-cccccccccccc/following", {
        returnTo: "/inbox",
      }),
    ).toBe("/inbox");
  });
});
