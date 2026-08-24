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

  it("parses legacy profile payload shape", () => {
    const parsed = decodeUserPublicFromPayload({
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
    });
    expect(parsed?.id).toBe("u2");
    expect(parsed?.followerCount).toBe(7);
    expect(parsed?.followingCount).toBe(8);
    expect(parsed?.isVerified).toBe(true);
  });
});
