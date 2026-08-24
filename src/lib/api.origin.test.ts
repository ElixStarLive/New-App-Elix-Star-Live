/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  APP_PRODUCTION_ORIGIN,
  LOCAL_DEBUG_API_ORIGIN,
  resolveNativeHttpOrigin,
} from "./api";

describe("canonical API origin", () => {
  it("rejects loopback on native production/store builds", () => {
    expect(resolveNativeHttpOrigin(LOCAL_DEBUG_API_ORIGIN, "production")).toBe(APP_PRODUCTION_ORIGIN);
    expect(resolveNativeHttpOrigin(LOCAL_DEBUG_API_ORIGIN, "store")).toBe(APP_PRODUCTION_ORIGIN);
    expect(resolveNativeHttpOrigin("http://localhost:8080", "production")).toBe(APP_PRODUCTION_ORIGIN);
    expect(resolveNativeHttpOrigin("", "production")).toBe(APP_PRODUCTION_ORIGIN);
  });

  it("allows USB debug loopback only in a non-production native build", () => {
    expect(resolveNativeHttpOrigin(LOCAL_DEBUG_API_ORIGIN, "android-debug")).toBe(LOCAL_DEBUG_API_ORIGIN);
  });

  it("keeps a non-loopback native override", () => {
    expect(resolveNativeHttpOrigin("https://www.elixstarlive.co.uk", "production")).toBe(
      "https://www.elixstarlive.co.uk",
    );
  });

  it("does not treat empty or LAN-looking values as a second API owner", () => {
    expect(resolveNativeHttpOrigin("", "android-debug")).toBe(APP_PRODUCTION_ORIGIN);
    expect(resolveNativeHttpOrigin("not-a-url", "android-debug")).toBe(APP_PRODUCTION_ORIGIN);
  });
});
