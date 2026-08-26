import { describe, expect, it } from "vitest";
import { realAvatarUrl } from "./avatarUrl";

describe("realAvatarUrl", () => {
  it("keeps real CDN photos and drops yellow defaults", () => {
    expect(realAvatarUrl("/royce/default-avatar.svg", "https://cdn.example/me.jpg")).toBe(
      "https://cdn.example/me.jpg",
    );
    expect(realAvatarUrl("https://ui-avatars.com/api/?name=x")).toBe("");
    expect(realAvatarUrl(null, undefined, "")).toBe("");
  });
});
