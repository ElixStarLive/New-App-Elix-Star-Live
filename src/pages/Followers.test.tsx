import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserPublic } from "@shared/contracts";
import { showToast } from "@/lib/toast";

const api = vi.hoisted(() => ({
  apiFetchFollowers: vi.fn(),
  apiFollowFollowerRow: vi.fn(),
  apiUnfollowFollowerRow: vi.fn(),
}));

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/features/profile/followersApi", () => api);
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (selector?: (state: { user: { id: string } }) => unknown) => {
    const state = { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } };
    return selector ? selector(state) : state;
  },
}));

import Followers from "./Followers";
import { namedHardwareBackTarget } from "@/lib/settingsNav";

const fan: UserPublic = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  username: "fan",
  displayName: "Fan Name",
  avatarUrl: null,
  bio: "",
  isVerified: false,
  followerCount: 0,
  followingCount: 0,
  isFollowing: false,
};

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}`}</div>;
}

function renderFollowers(
  initialEntry: string | { pathname: string; state?: unknown } = "/profile/cccccccc-cccc-4ccc-8ccc-cccccccccccc/followers",
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/profile/:userId/followers" element={<Followers />} />
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
  api.apiFetchFollowers.mockReset();
  api.apiFollowFollowerRow.mockReset();
  api.apiUnfollowFollowerRow.mockReset();
  api.apiFetchFollowers.mockResolvedValue({ users: [fan], error: null });
  api.apiFollowFollowerRow.mockResolvedValue({ ok: true });
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

describe("PAGE-027 Followers page", () => {
  it("lists followers and follow-back uses the shared follow API", async () => {
    const view = renderFollowers();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Followers");
    expect(container.textContent).toContain("Fan Name");
    expect(container.textContent).toContain("@fan");
    const follow = Array.from(container.querySelectorAll("button")).find((btn) => btn.textContent === "Follow");
    await act(async () => {
      follow?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(api.apiFollowFollowerRow).toHaveBeenCalledWith(fan.id);
  });

  it("shows the empty copy when there are no followers", async () => {
    api.apiFetchFollowers.mockResolvedValue({ users: [], error: null });
    const view = renderFollowers();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("No followers yet.");
  });

  it("shows blocked/forbidden load errors without inventing rows", async () => {
    api.apiFetchFollowers.mockResolvedValue({
      users: [],
      error: "You cannot view this profile",
      status: 403,
    });
    const view = renderFollowers();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("You cannot view this profile");
    expect(container.textContent).not.toContain("No followers yet.");
  });

  it("toasts a stable follow failure message when the server rejects", async () => {
    api.apiFollowFollowerRow.mockResolvedValue({ ok: false, error: "forbidden" });
    const view = renderFollowers();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const follow = Array.from(container.querySelectorAll("button")).find((btn) => btn.textContent === "Follow");
    await act(async () => {
      follow?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(showToast).toHaveBeenCalledWith("Could not update follow");
  });

  it("closes to the source profile and uses named hardware back", async () => {
    const view = renderFollowers();
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
    expect(namedHardwareBackTarget("/profile/cccccccc-cccc-4ccc-8ccc-cccccccccccc/followers")).toBe(
      "/profile/cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    );
  });

  it("honors Inbox returnTo on close and hardware back", async () => {
    const view = renderFollowers({
      pathname: "/profile/cccccccc-cccc-4ccc-8ccc-cccccccccccc/followers",
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
      namedHardwareBackTarget("/profile/cccccccc-cccc-4ccc-8ccc-cccccccccccc/followers", {
        returnTo: "/inbox",
      }),
    ).toBe("/inbox");
  });
});
