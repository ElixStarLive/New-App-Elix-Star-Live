import { describe, expect, it } from "vitest";
import { emailVerifyCallbackUrl } from "./emailVerify.js";

describe("email verify contract", () => {
  it("hands PAGE-002 links to PAGE-003", () => {
    const url = emailVerifyCallbackUrl("https://elix.example/", "abc123token");
    expect(url).toBe("https://elix.example/auth/callback?token=abc123token");
    expect(url).not.toContain("/verify-email");
  });
});
