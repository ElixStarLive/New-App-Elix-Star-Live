import { describe, expect, it } from "vitest";
import { interpretSafetyModel, LIVE_SAFETY_WARNING } from "./moderation.js";

describe("FLOW-025 live safety classify", () => {
  it("flags only the named dangerous categories and never invents a pause/end action", () => {
    expect(interpretSafetyModel({ flagged: true, category: "driving_while_live", severity: "high" })).toEqual({
      flagged: true,
      category: "driving_while_live",
      severity: "high",
    });
    expect(interpretSafetyModel({ flagged: true, category: "smoking", severity: "high" }).flagged).toBe(false);
    expect(interpretSafetyModel({ flagged: false, category: "dangerous_stunt" }).flagged).toBe(false);
    expect(LIVE_SAFETY_WARNING).toContain("safety guidelines");
  });
});
