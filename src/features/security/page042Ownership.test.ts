import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/settings/SecuritySettings.tsx"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/security/securitySession.ts"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/security/securityApi.ts"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const settings = readFileSync(resolve(process.cwd(), "src/pages/Settings.tsx"), "utf8");
const login = readFileSync(resolve(process.cwd(), "src/pages/Login.tsx"), "utf8");
const loginTest = readFileSync(resolve(process.cwd(), "src/pages/Login.test.tsx"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/auth/router.ts"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");
const forgot = readFileSync(resolve(process.cwd(), "src/pages/ForgotPassword.tsx"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("PAGE-042 Security ownership", () => {
  it("has one /settings/security owner on the Settings option sheet", () => {
    expect(app.match(/path="\/settings\/security"/g)?.length).toBe(1);
    expect(app).not.toMatch(/path="\/security"/);
    expect(app).not.toMatch(/path="\/settings\/2fa"/);
    expect(app).not.toMatch(/path="\/two-factor"/);
    expect(page).toMatch(/SettingsOptionSheet/);
    expect(page).toMatch(/title="Security"/);
    expect(page).not.toMatch(/SettingsSubpage|SecurityV2|SecurityFixed|page-above-bottom-nav/);
    expect(page).not.toMatch(/history\.back|navigate\(-1\)|location\.reload|window\.prompt|window\.confirm/);
    expect(page).not.toMatch(/setTimeout\(|localStorage|sessionStorage/);
    expect(page).not.toMatch(/change-password|Current password|Enroll authenticator/);
    expect(page).not.toMatch(/WebSocket|wsClient|new WebSocket/);
    expect(settings).toMatch(/go\("\/settings\/security"\)/);
    expect(nav).toMatch(/if \(path === SETTINGS_HOME\) return SETTINGS_EXIT_TO/);
  });

  it("uses one server-authoritative 2FA contract", () => {
    expect(api).toMatch(/\/api\/auth\/2fa\/status/);
    expect(api).toMatch(/\/api\/auth\/2fa\/enroll/);
    expect(api).toMatch(/\/api\/auth\/2fa\/verify/);
    expect(api).toMatch(/\/api\/auth\/2fa\/disable/);
    expect(api).not.toMatch(/\/api\/auth\/2fa\/state|\/api\/two-factor/);
    expect(api.match(/\/api\/auth\/2fa\/status/g)?.length).toBe(1);
    expect(api.match(/\/api\/auth\/2fa\/enroll/g)?.length).toBe(1);
    expect(session).toMatch(/createSecuritySession/);
    expect(session).not.toMatch(/localStorage|sessionStorage|console\.log|otpauth/);
    expect(session).not.toMatch(/setTimeout\(|location\.reload|setTwoFactorEnabled|is2faEnabled/);
    expect(router).toMatch(/router\.get\("\/2fa\/status"/);
    expect(router).toMatch(/router\.post\("\/2fa\/enroll"/);
    expect(router).toMatch(/router\.post\("\/2fa\/verify"/);
    expect(router).toMatch(/router\.post\("\/2fa\/disable"/);
    expect(router).toMatch(/twoFactorCodeBodySchema\.parse/);
    expect(router).toMatch(/2FA already enabled/);
    expect(router).toMatch(/Enroll 2FA before verifying/);
    expect(router).toMatch(/2FA is not enabled/);
    expect(router).not.toMatch(/logger\.(info|error|warn|debug)\([^)]*secret/);
    expect(router).not.toMatch(/console\.log/);
  });

  it("keeps Login and Forgot Password as separate owners", () => {
    expect(login).not.toMatch(/2fa\/enroll|otpauth|authenticator app|QR/);
    expect(login).not.toMatch(/SecuritySettings|createSecuritySession/);
    expect(loginTest).toMatch(/Authenticator code/);
    expect(forgot).toMatch(/Forgot Password/);
    expect(page).toMatch(/\/forgot-password/);
    expect(page).not.toMatch(/authForgotPassword|reset-password/);
    expect(ws).toMatch(/ownerId: "app-feed-presence"/);
    expect(ws.match(/new WebSocket/g) ?? []).toHaveLength(0);
  });

  it("does not persist or hardcode a TOTP secret", () => {
    expect(page).not.toMatch(/JBSWY3DPEHPK3PXP|otpauth:\/\/totp/);
    expect(api).not.toMatch(/JBSWY3DPEHPK3PXP|otpauth:\/\/totp/);
    expect(session).not.toMatch(/JBSWY3DPEHPK3PXP|generateTotpSecret/);
    expect(page + api + session).not.toMatch(/persist\(|createJSONStorage/);
  });
});
