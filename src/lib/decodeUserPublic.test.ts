import { describe, expect, it } from "vitest";
import { decodeUserPublicFromPayload } from "@/lib/decodeUserPublic";

describe("decodeUserPublicFromPayload", () => {
  it("parses canonical NEW payload", () => {
    const parsed = decodeUserPublicFromPayload({
      user: {
        id: "u1",
        username: "alice",
        displayName: "Alice",
        avatarUrl: null,
        bio: "",
        isVerified: false,
        followerCount: 1,
        followingCount: 2,
      },
    });
    expect(parsed?.id).toBe("u1");
    expect(parsed?.followerCount).toBe(1);
  });

  it("rejects legacy profile / snake_case dual-read shapes", () => {
    expect(
      decodeUserPublicFromPayload({
        profile: {
          userId: "u2",
          username: "bob",
          displayName: "Bob",
          avatarUrl: "",
          bio: "",
          isVerified: true,
          followers: 7,
          following: 8,
        },
      }),
    ).toBeNull();
    expect(
      decodeUserPublicFromPayload({
        user: {
          id: "u3",
          username: "cara",
          display_name: "Cara",
          avatar_url: null,
          bio: "",
          is_verified: false,
          followers_count: 1,
          following_count: 2,
        },
      }),
    ).toBeNull();
  });
});
