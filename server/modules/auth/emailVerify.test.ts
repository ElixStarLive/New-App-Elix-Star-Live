import { describe, expect, it } from "vitest";
import { emailVerifyBinding, emailVerifyCallbackUrl } from "./emailVerify.js";

describe("email verify contract", () => {
  it("hands PAGE-002 links to PAGE-003", () => {
    const url = emailVerifyCallbackUrl("https://elix.example/", "abc.jwt.token");
    expect(url).toBe("https://elix.example/auth/callback?token=abc.jwt.token");
    expect(url).not.toContain("/verify-email");
  });

  it("changes binding once the account is confirmed", () => {
    const pending = emailVerifyBinding({
      id: "u1",
      email: "a@b.co",
      email_confirmed_at: null,
      password_hash: "hash",
    });
    const confirmed = emailVerifyBinding({
      id: "u1",
      email: "a@b.co",
      email_confirmed_at: "2026-08-23T00:00:00.000Z",
      password_hash: "hash",
    });
    expect(pending).not.toBe(confirmed);
    expect(pending).toHaveLength(22);
  });
});
