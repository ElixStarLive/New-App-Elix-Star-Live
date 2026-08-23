import { afterEach, describe, expect, it } from "vitest";
import { isEngagementHubEnabled } from "./flags.js";

describe("PAGE-047 server engagement flag", () => {
  const previousHub = process.env.ENGAGEMENT_HUB_ENABLED;
  const previousVite = process.env.VITE_ENGAGEMENT_HUB_ENABLED;

  afterEach(() => {
    if (previousHub == null) delete process.env.ENGAGEMENT_HUB_ENABLED;
    else process.env.ENGAGEMENT_HUB_ENABLED = previousHub;
    if (previousVite == null) delete process.env.VITE_ENGAGEMENT_HUB_ENABLED;
    else process.env.VITE_ENGAGEMENT_HUB_ENABLED = previousVite;
  });

  it("fails closed unless an explicit true value is set", () => {
    delete process.env.ENGAGEMENT_HUB_ENABLED;
    delete process.env.VITE_ENGAGEMENT_HUB_ENABLED;
    expect(isEngagementHubEnabled()).toBe(false);
    process.env.ENGAGEMENT_HUB_ENABLED = "maybe";
    expect(isEngagementHubEnabled()).toBe(false);
    process.env.ENGAGEMENT_HUB_ENABLED = "false";
    expect(isEngagementHubEnabled()).toBe(false);
    process.env.ENGAGEMENT_HUB_ENABLED = "true";
    expect(isEngagementHubEnabled()).toBe(true);
  });
});
