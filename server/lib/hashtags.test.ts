import { describe, expect, it } from "vitest";
import { extractHashtags, normalizeHashtag } from "./hashtags.js";

describe("extractHashtags", () => {
  it("lowercases tags and drops duplicates", () => {
    expect(extractHashtags("Loving #Live and #LIVE music #Music")).toEqual(["live", "music"]);
  });

  it("keeps digits and underscores but stops at other punctuation", () => {
    expect(extractHashtags("#top_10, #dance! #ünicode")).toEqual(["top_10", "dance"]);
  });

  it("returns an empty list when there is nothing to extract", () => {
    expect(extractHashtags("")).toEqual([]);
    expect(extractHashtags("no tags here")).toEqual([]);
    expect(extractHashtags("# ##")).toEqual([]);
  });
});

describe("normalizeHashtag", () => {
  it("trims, strips a single leading hash and lowercases", () => {
    expect(normalizeHashtag("  #Live  ")).toBe("live");
    expect(normalizeHashtag("LIVE")).toBe("live");
    expect(normalizeHashtag("##live")).toBe("#live");
  });
});
