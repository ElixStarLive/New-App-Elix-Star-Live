import { describe, expect, it } from "vitest";
import { normalizeHashtag } from "./hashtag";

describe("PAGE-013 hashtag normalization", () => {
  it("strips one leading hash and lowercases", () => {
    expect(normalizeHashtag("Music")).toBe("music");
    expect(normalizeHashtag("#music")).toBe("music");
    expect(normalizeHashtag("MUSIC")).toBe("music");
    expect(normalizeHashtag("  #Dance  ")).toBe("dance");
  });

  it("does not collapse ## into a stored tag", () => {
    expect(normalizeHashtag("##music")).toBe("#music");
  });

  it("treats empty and hash-only as invalid", () => {
    expect(normalizeHashtag("")).toBe("");
    expect(normalizeHashtag("#")).toBe("");
    expect(normalizeHashtag("   ")).toBe("");
  });
});
