import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("PAGE-003 AuthCallback ownership", () => {
  it("keeps a single callback owner on /auth/callback with verify-email contract", () => {
    const page = read("src/pages/AuthCallback.tsx");
    const app = read("src/App.tsx");
    const authSession = read("src/features/auth/authSession.ts");
    const emailVerify = read("server/modules/auth/emailVerify.ts");
    const authRouter = read("server/modules/auth/router.ts");

    expect(app).toContain('path="/auth/callback"');
    expect(app).not.toContain('path="/verify-email"');
    expect(page).toContain("Auth Callback");
    expect(page).toContain("authVerifyEmail");
    expect(page).toContain('navigate("/profile", { replace: true })');
    expect(page).toContain('navigate("/login", { replace: true })');
    expect(page).not.toContain("localStorage");
    expect(page).not.toContain("digit");

    expect(authSession).toContain('"/api/auth/verify-email"');
    expect(authSession).toContain("Verification failed.");
    expect(emailVerify).toContain('purpose: "email_verify"');
    expect(emailVerify).toContain("Invalid or expired confirmation link.");
    expect(emailVerify).toContain("This confirmation link is no longer valid.");
    expect(authRouter).toContain('router.post("/verify-email"');
    expect(authRouter).toContain('router.post("/resend-confirmation"');
    expect(authRouter).toContain("email_confirm_sent:");
    expect(authRouter).toContain("accessToken: session.token");
  });
});
