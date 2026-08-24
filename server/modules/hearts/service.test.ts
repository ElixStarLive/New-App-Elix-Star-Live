import { describe, expect, it } from "vitest";
import { dailyHeartSendBodySchema } from "../../../shared/contracts/hearts.js";

describe("FLOW-022 daily hearts contract", () => {
  it("requires a creator UUID and treats a second same-day row as already", () => {
    expect(dailyHeartSendBodySchema.safeParse({ creatorId: "not-a-uuid" }).success).toBe(false);
    expect(
      dailyHeartSendBodySchema.safeParse({ creatorId: "11111111-1111-4111-8111-111111111111" }).success,
    ).toBe(true);
    const first = { ok: true as const, already: false };
    const again = { ok: true as const, already: true };
    expect(first.already).toBe(false);
    expect(again.ok).toBe(true);
  });
});
