import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("PAGE-004 Forgot Password ownership", () => {
  it("keeps a single ForgotPassword owner with enumeration-safe forgot-password contract", () => {
    const page = read("src/pages/ForgotPassword.tsx");
    const app = read("src/App.tsx");
    const authSession = read("src/features/auth/authSession.ts");
    const passwordReset = read("server/modules/auth/passwordReset.ts");
    const authRouter = read("server/modules/auth/router.ts");
    const shared = read("src/components/AuthFormErrorAndSubmit.tsx");

    expect(app).toContain('path="/forgot-password"');
    expect(page).toContain("Forgot Password");
    expect(page).toContain("Check your email");
    expect(page).toContain("authForgotPassword");
    expect(page).toContain("AuthFormErrorAndSubmit");
    expect(page).toContain("isPasswordResetEnabled");
    expect(page).toContain('to="/login"');
    expect(page).not.toContain("token=");
    expect(page).not.toContain("localStorage");

    expect(page).toContain('idleLabel="Send Reset Link"');
    expect(page).toContain('submittingLabel="Sending..."');
    expect(shared).toContain("submittingLabel");
    expect(shared).toContain("idleLabel");
    expect(authSession).toContain('"/api/auth/forgot-password"');
    expect(authSession).toContain("Email is required.");
    expect(passwordReset).toContain("PASSWORD_RESET_REQUEST_MAX");
    expect(passwordReset).toContain('purpose: "password_reset"');
    expect(passwordReset).toContain("/reset-password?token=");
    expect(passwordReset).toContain("Too many reset requests. Please try again later.");
    expect(authRouter).toContain('router.post("/forgot-password"');
    expect(authRouter).toContain("res.json({ success: true })");
    expect(authRouter).toContain("assertPasswordResetRequestAllowed");
  });
});
