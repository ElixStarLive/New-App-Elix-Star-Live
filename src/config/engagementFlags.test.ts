/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { isEngagementHubEnabled } from "./engagementFlags";

describe("PAGE-047 engagement hub flag", () => {
  afterEach(() => {
    if (typeof window !== "undefined") {
      delete window.__ELIX_ENV?.VITE_ENGAGEMENT_HUB_ENABLED;
    }
  });

  it("fails closed when unset and only enables from an explicit true value", () => {
    expect(isEngagementHubEnabled()).toBe(false);
    window.__ELIX_ENV = { ...(window.__ELIX_ENV ?? {}), VITE_ENGAGEMENT_HUB_ENABLED: "maybe" };
    expect(isEngagementHubEnabled()).toBe(false);
    window.__ELIX_ENV.VITE_ENGAGEMENT_HUB_ENABLED = "false";
    expect(isEngagementHubEnabled()).toBe(false);
    window.__ELIX_ENV.VITE_ENGAGEMENT_HUB_ENABLED = "true";
    expect(isEngagementHubEnabled()).toBe(true);
  });
});
