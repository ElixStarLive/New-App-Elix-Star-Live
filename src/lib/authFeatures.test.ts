/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { isAppleSignInEnabled, isPasswordResetEnabled } from "./authFeatures";

describe("PAGE-001 auth feature flags", () => {
  afterEach(() => {
    delete window.__ELIX_ENV;
  });

  it("keeps Apple off unless the runtime or vite flag is exactly true", () => {
    window.__ELIX_ENV = { VITE_APPLE_SIGN_IN_ENABLED: "false" };
    expect(isAppleSignInEnabled()).toBe(false);
    window.__ELIX_ENV = { VITE_APPLE_SIGN_IN_ENABLED: "true" };
    expect(isAppleSignInEnabled()).toBe(true);
  });

  it("keeps Forgot Password off unless email is configured", () => {
    window.__ELIX_ENV = { VITE_EMAIL_CONFIGURED: "false" };
    expect(isPasswordResetEnabled()).toBe(false);
    window.__ELIX_ENV = { VITE_EMAIL_CONFIGURED: "true" };
    expect(isPasswordResetEnabled()).toBe(true);
  });
});
