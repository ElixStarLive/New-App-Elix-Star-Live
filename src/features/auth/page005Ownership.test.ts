import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("PAGE-005 Reset Password ownership", () => {
  it("keeps a single ResetPassword owner with canonical reset-password contract", () => {
    const page = read("src/pages/ResetPassword.tsx");
    const app = read("src/App.tsx");
    const authSession = read("src/features/auth/authSession.ts");
    const passwordReset = read("server/modules/auth/passwordReset.ts");
    const authRouter = read("server/modules/auth/router.ts");
    const shared = read("src/components/AuthFormErrorAndSubmit.tsx");
    const contract = read("shared/contracts/auth.ts");

    expect(app).toContain('path="/reset-password"');
    expect(page).toContain("Reset Password");
    expect(page).toContain("Password Reset!");
    expect(page).toContain("authResetPassword");
    expect(page).toContain("AuthFormErrorAndSubmit");
    expect(page).toContain('idleLabel="Reset Password"');
    expect(page).toContain('submittingLabel="Updating..."');
    expect(page).toContain('searchParams.get("token")');
    expect(page).toContain('navigate("/login"');
    expect(page).not.toContain("localStorage");
    expect(page).not.toContain("showPassword");
    expect(page).not.toContain("Eye");
    expect(page).not.toContain("type=\"text\"");

    expect(shared).toContain("submittingLabel");
    expect(shared).toContain("idleLabel");

    expect(authSession).toContain('"/api/auth/reset-password"');
    expect(authSession).toContain('JSON.stringify({ password, token: trimmed })');
    expect(authSession).toContain("Password reset is not available at this time.");

    expect(passwordReset).toContain("applyPasswordReset");
    expect(passwordReset).toContain('purpose: "password_reset"');
    expect(passwordReset).toContain("passwordResetBinding");
    expect(passwordReset).toContain("hashPassword(newPassword)");
    expect(passwordReset).toContain("auth_sessions SET revoked_at");
    expect(passwordReset).toContain("/reset-password?token=");
    expect(passwordReset).not.toContain("plaintext");

    expect(authRouter).toContain('router.post("/reset-password"');
    expect(authRouter).toContain("applyPasswordReset");
    expect(authRouter).toContain("res.json({ success: true })");
    expect(authRouter).toContain("disconnectUserSessions");

    expect(contract).toContain("resetPasswordBodySchema");
    expect(contract).toContain('z.string().min(8, "Password must be at least 8 characters.")');
  });
});
