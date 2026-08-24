import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileEditUser } from "@shared/contracts";
import { createEditProfileSession } from "./editProfileSession";

const api = vi.hoisted(() => ({
  apiFetchEditProfile: vi.fn(),
  apiSaveEditProfile: vi.fn(),
  apiUploadEditAvatar: vi.fn(),
  editAvatarFileError: vi.fn(),
  editUsernameError: vi.fn(),
  normalizeEditUsername: (value: string) => value.replace(/^@+/, "").replace(/\s+/g, ""),
}));

vi.mock("./editProfileApi", async () => {
  const actual = await vi.importActual<typeof import("./editProfileApi")>("./editProfileApi");
  return {
    ...actual,
    apiFetchEditProfile: api.apiFetchEditProfile,
    apiSaveEditProfile: api.apiSaveEditProfile,
    apiUploadEditAvatar: api.apiUploadEditAvatar,
    editAvatarFileError: api.editAvatarFileError,
    editUsernameError: api.editUsernameError,
    normalizeEditUsername: api.normalizeEditUsername,
  };
});

const me: ProfileEditUser = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  username: "owner",
  displayName: "Owner",
  avatarUrl: "https://cdn.example/a.jpg",
  bio: "hello",
  isVerified: false,
  followerCount: 1,
  followingCount: 2,
  likeCount: 3,
  viewCount: 4,
  website: "",
  instagram: "",
  youtube: "",
  tiktok: "",
};

describe("PAGE-026 edit profile session", () => {
  beforeEach(() => {
    api.apiFetchEditProfile.mockReset();
    api.apiSaveEditProfile.mockReset();
    api.apiUploadEditAvatar.mockReset();
    api.editAvatarFileError.mockReset();
    api.editUsernameError.mockReset();
    api.editUsernameError.mockReturnValue(null);
    api.editAvatarFileError.mockReturnValue(null);
  });

  it("hydrates from GET /me and does not keep a previous account after dispose", async () => {
    api.apiFetchEditProfile.mockResolvedValue({ profile: me, error: null });
    const session = createEditProfileSession();
    await session.load();
    expect(session.getSnapshot().username).toBe("owner");
    expect(session.getSnapshot().displayName).toBe("Owner");
    session.dispose();
    expect(session.getSnapshot().username).toBe("");
    expect(session.getSnapshot().avatarUrl).toBe("");
  });

  it("blocks a second Save while the first is in flight", async () => {
    api.apiFetchEditProfile.mockResolvedValue({ profile: me, error: null });
    let release: (value: { profile: ProfileEditUser; error: null }) => void = () => undefined;
    api.apiSaveEditProfile.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve as (value: { profile: ProfileEditUser; error: null }) => void;
        }),
    );
    const session = createEditProfileSession();
    await session.load();
    const first = session.save();
    const second = await session.save();
    expect(second).toEqual({ ok: false, error: "busy" });
    release({ profile: { ...me, displayName: "Saved" }, error: null });
    const done = await first;
    expect(done).toEqual({ ok: true, profile: { ...me, displayName: "Saved" } });
    expect(api.apiSaveEditProfile).toHaveBeenCalledTimes(1);
  });

  it("does not treat a failed save as success", async () => {
    api.apiFetchEditProfile.mockResolvedValue({ profile: me, error: null });
    api.apiSaveEditProfile.mockResolvedValue({ profile: null, error: "That username is already taken", status: 409 });
    const session = createEditProfileSession();
    await session.load();
    session.setUsername("taken.name");
    const res = await session.save();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("That username is already taken");
    expect(session.getSnapshot().username).toBe("taken.name");
  });
});
