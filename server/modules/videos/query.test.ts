import { describe, expect, it } from "vitest";
import { isVideoId, savedListPaging } from "./query.js";

describe("PAGE-014 video id", () => {
  it("accepts a uuid and rejects malformed ids", () => {
    expect(isVideoId("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isVideoId("not-a-video")).toBe(false);
    expect(isVideoId("")).toBe(false);
  });
});

describe("PAGE-015 saved list paging", () => {
  it("clamps limit and offset", () => {
    expect(savedListPaging({})).toEqual({ limit: 50, offset: 0 });
    expect(savedListPaging({ limit: "3", offset: "10" })).toEqual({ limit: 3, offset: 10 });
    expect(savedListPaging({ limit: "0", offset: "-4" })).toEqual({ limit: 1, offset: 0 });
    expect(savedListPaging({ limit: "999", offset: "nope" })).toEqual({ limit: 100, offset: 0 });
  });
});
