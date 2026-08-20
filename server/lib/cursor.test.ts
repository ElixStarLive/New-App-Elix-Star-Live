import { describe, expect, it } from "vitest";
import { decodeKeyset, encodeKeyset } from "./cursor.js";

describe("feed keyset cursor", () => {
  it("round-trips created_at and id", () => {
    const encoded = encodeKeyset("2026-08-20T01:00:00.000Z", "11111111-1111-1111-1111-111111111111");
    expect(decodeKeyset(encoded)).toEqual({
      createdAt: "2026-08-20T01:00:00.000Z",
      id: "11111111-1111-1111-1111-111111111111",
    });
  });

  it("rejects garbage instead of inventing a page", () => {
    expect(decodeKeyset("not-a-cursor")).toBeNull();
    expect(decodeKeyset("")).toBeNull();
  });
});
