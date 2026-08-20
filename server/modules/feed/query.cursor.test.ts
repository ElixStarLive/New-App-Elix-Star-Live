import { describe, expect, it } from "vitest";
import { decodeOffsetCursor, encodeOffsetCursor } from "./query.js";

describe("PAGE-007 foryou offset cursor", () => {
  it("round-trips offsets", () => {
    expect(decodeOffsetCursor(encodeOffsetCursor(20))).toBe(20);
    expect(decodeOffsetCursor(encodeOffsetCursor(0))).toBe(0);
  });

  it("rejects garbage instead of inventing a page", () => {
    expect(decodeOffsetCursor("not-a-cursor")).toBe(0);
    expect(decodeOffsetCursor("eyJ0IjoiYmFkIn0")).toBe(0);
  });
});
