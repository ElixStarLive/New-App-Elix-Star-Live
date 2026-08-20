import { describe, expect, it } from "vitest";
import { passwordResetCallbackUrl } from "./passwordReset.js";

describe("password reset request contract", () => {
  it("hands PAGE-004 links to PAGE-005", () => {
    const url = passwordResetCallbackUrl("https://elix.example/", "abc123token");
    expect(url).toBe("https://elix.example/reset-password?token=abc123token");
    expect(url).not.toContain("/auth/callback");
    expect(url).not.toContain("/forgot-password");
  });
});
