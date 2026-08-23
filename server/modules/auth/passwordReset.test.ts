import { describe, expect, it } from "vitest";
import { passwordResetBinding, passwordResetCallbackUrl } from "./passwordReset.js";

describe("password reset request contract", () => {
  it("hands PAGE-004 links to PAGE-005", () => {
    const url = passwordResetCallbackUrl("https://elix.example/", "abc.jwt.token");
    expect(url).toBe("https://elix.example/reset-password?token=abc.jwt.token");
    expect(url).not.toContain("/auth/callback");
    expect(url).not.toContain("/forgot-password");
  });

  it("changes binding when the password hash changes", () => {
    const before = passwordResetBinding("hash-a");
    const after = passwordResetBinding("hash-b");
    expect(before).not.toBe(after);
    expect(before).toHaveLength(22);
  });
});
