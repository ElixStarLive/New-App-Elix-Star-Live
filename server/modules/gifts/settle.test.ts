import { describe, expect, it } from "vitest";
import { splitGiftPence } from "./settle.js";

describe("paid gift GBP split", () => {
  it("gives the creator 60% and the platform the remainder", () => {
    expect(splitGiftPence(100, 60)).toEqual({ creatorPence: 60, platformPence: 40 });
    expect(splitGiftPence(99, 60)).toEqual({ creatorPence: 59, platformPence: 40 });
  });

  it("does not invent money for unpaid buckets", () => {
    expect(splitGiftPence(0, 60)).toEqual({ creatorPence: 0, platformPence: 0 });
  });
});
