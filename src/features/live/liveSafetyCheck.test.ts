import { describe, expect, it } from "vitest";
import { LIVE_SAFETY_TICK_MS, LIVE_SAFETY_WARNING, frameFromLiveVideo } from "./liveSafetyCheck";

describe("FLOW-025 host safety tick", () => {
  it("keeps the 30s host check and the visible warning copy", () => {
    expect(LIVE_SAFETY_TICK_MS).toBe(30_000);
    expect(LIVE_SAFETY_WARNING).toContain("safety guidelines");
    expect(frameFromLiveVideo(null)).toBeNull();
  });
});
