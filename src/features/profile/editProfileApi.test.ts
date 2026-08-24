import { describe, expect, it, vi } from "vitest";
import { apiFetchEditProfile, apiSaveEditProfile, editUsernameError } from "./editProfileApi";

const apiRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/apiClient", () => ({
  apiRequest,
  apiUploadForm: vi.fn(),
}));

vi.mock("./ownProfileApi", () => ({
  apiUploadOwnAvatar: vi.fn(),
}));

const user = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  username: "owner",
  displayName: "Owner",
  avatarUrl: null,
  bio: "hi",
  isVerified: false,
  followerCount: 0,
  followingCount: 0,
  likeCount: 0,
  viewCount: 0,
  website: "https://elix.example",
  instagram: "@elix",
  youtube: "",
  tiktok: "",
};

describe("PAGE-026 edit profile API", () => {
  it("loads and saves GET/PATCH /api/profiles/me only", async () => {
    apiRequest.mockResolvedValue({ data: { user }, error: null });
    const loaded = await apiFetchEditProfile();
    expect(apiRequest).toHaveBeenCalledWith("/api/profiles/me");
    expect(loaded.profile?.website).toBe("https://elix.example");
    apiRequest.mockClear();
    apiRequest.mockResolvedValue({ data: { user: { ...user, displayName: "New" } }, error: null });
    const saved = await apiSaveEditProfile({ displayName: "New", username: "owner", bio: "hi", website: "", instagram: "", youtube: "", tiktok: "" });
    expect(apiRequest.mock.calls[0]?.[0]).toBe("/api/profiles/me");
    expect(apiRequest.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH" });
    expect(String(apiRequest.mock.calls[0]?.[1]?.body)).not.toContain("isAdmin");
    expect(saved.profile?.displayName).toBe("New");
  });

  it("rejects invalid usernames before the network", () => {
    expect(editUsernameError("")).toBe("Username is required");
    expect(editUsernameError("ab")).toBe("Username: 3–30 letters, numbers, . or _");
    expect(editUsernameError("andrei.live")).toBeNull();
  });
});
