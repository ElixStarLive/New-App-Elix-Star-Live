import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileEditUser } from "@shared/contracts";

const api = vi.hoisted(() => ({
  apiFetchEditProfile: vi.fn(),
  apiSaveEditProfile: vi.fn(),
  apiUploadEditAvatar: vi.fn(),
  editAvatarFileError: vi.fn(),
  editUsernameError: vi.fn(),
  normalizeEditUsername: (value: string) => value.replace(/^@+/, "").replace(/\s+/g, ""),
}));

vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
vi.mock("@/features/profile/editProfileApi", () => api);
vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (selector?: (state: { user: { id: string }; updateUser: () => void }) => unknown) => {
    const state = { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, updateUser: vi.fn() };
    return selector ? selector(state) : state;
  },
}));

import EditProfile from "./EditProfile";
import { namedHardwareBackTarget } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";

const me: ProfileEditUser = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  username: "owner",
  displayName: "Owner Name",
  avatarUrl: "https://cdn.example/a.jpg",
  bio: "My bio",
  isVerified: false,
  followerCount: 0,
  followingCount: 0,
  website: "https://site.example",
  instagram: "",
  youtube: "",
  tiktok: "",
};

function LocationProbe() {
  const location = useLocation();
  return <div>{`LOC ${location.pathname}`}</div>;
}

function renderEdit(entry = "/edit-profile") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/edit-profile" element={<EditProfile />} />
          <Route path="/settings" element={<LocationProbe />} />
          <Route path="/profile" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  api.apiFetchEditProfile.mockReset();
  api.apiSaveEditProfile.mockReset();
  api.apiUploadEditAvatar.mockReset();
  api.editAvatarFileError.mockReset();
  api.editUsernameError.mockReset();
  api.editUsernameError.mockReturnValue(null);
  api.editAvatarFileError.mockReturnValue(null);
  api.apiFetchEditProfile.mockResolvedValue({ profile: me, error: null });
  api.apiSaveEditProfile.mockResolvedValue({ profile: { ...me, displayName: "Saved Name" }, error: null });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
});

describe("PAGE-026 Edit Profile page", () => {
  it("hydrates authoritative fields and saves back to Settings", async () => {
    const view = renderEdit();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Edit Profile");
    const usernameInput = container.querySelector('input[placeholder="your_username"]') as HTMLInputElement | null;
    expect(usernameInput?.value).toBe("owner");
    const save = Array.from(container.querySelectorAll("button")).find((btn) => btn.textContent === "Save");
    await act(async () => {
      save?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(api.apiSaveEditProfile).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("LOC /settings");
  });

  it("keeps unsaved text when save fails", async () => {
    api.apiSaveEditProfile.mockResolvedValue({ profile: null, error: "That username is already taken", status: 409 });
    const view = renderEdit();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const save = Array.from(container.querySelectorAll("button")).find((btn) => btn.textContent === "Save");
    await act(async () => {
      save?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(showToast).toHaveBeenCalled();
    expect(container.textContent).not.toContain("LOC /settings");
    expect(container.textContent).toContain("Edit Profile");
  });

  it("closes to Settings and uses named hardware back", async () => {
    const view = renderEdit();
    root = view.root;
    container = view.container;
    await act(async () => {
      await Promise.resolve();
    });
    const close = container.querySelector('[aria-label="Close"]') as HTMLButtonElement | null;
    await act(async () => {
      close?.click();
    });
    expect(container.textContent).toContain("LOC /settings");
    expect(namedHardwareBackTarget("/edit-profile")).toBe("/settings");
  });
});
