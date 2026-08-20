import { describe, expect, it } from "vitest";
import { namedHardwareBackTarget } from "./settingsNav";

describe("PAGE-006 named hardware back", () => {
  it("stays on For You instead of WebView history", () => {
    expect(namedHardwareBackTarget("/feed")).toBeNull();
  });

  it("returns Search to For You", () => {
    expect(namedHardwareBackTarget("/search")).toBe("/feed");
  });

  it("stays on other root tabs", () => {
    expect(namedHardwareBackTarget("/friends")).toBeNull();
    expect(namedHardwareBackTarget("/inbox")).toBeNull();
    expect(namedHardwareBackTarget("/profile")).toBeNull();
  });
});
