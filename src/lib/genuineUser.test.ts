import { describe, expect, it } from "vitest";
import { isGenuineAppUser, storyCirclePhotoUrl } from "./genuineUser";

describe("genuineUser story circles", () => {
  it("keeps allowlisted real accounts and drops proof usernames", () => {
    expect(isGenuineAppUser("Andrei Ionut Berica", "u1", "Andrei")).toBe(true);
    expect(isGenuineAppUser("Anya Emily", "u2")).toBe(true);
    expect(isGenuineAppUser("p5mt9eh4wf", "u3")).toBe(false);
    expect(isGenuineAppUser("page001b_1787703540", "u4")).toBe(false);
  });

  it("uses real photo URLs and never the yellow default silhouette", () => {
    expect(storyCirclePhotoUrl(null, "/royce/default-avatar.svg", "https://cdn.example/a.jpg")).toBe(
      "https://cdn.example/a.jpg",
    );
    expect(storyCirclePhotoUrl("/royce/default-avatar.svg")).toBe("");
    expect(storyCirclePhotoUrl("")).toBe("");
  });
});
