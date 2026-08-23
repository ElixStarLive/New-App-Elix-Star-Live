import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const login = readFileSync(resolve(process.cwd(), "src/pages/Login.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/auth/authSession.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/auth/router.ts"), "utf8");
const contract = readFileSync(resolve(process.cwd(), "shared/contracts/auth.ts"), "utf8");
const features = readFileSync(resolve(process.cwd(), "src/lib/authFeatures.ts"), "utf8");

describe("PAGE-001 Login ownership", () => {
  it("has one /login owner and the production login contract", () => {
    expect(app.match(/path="\/login"/g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/login" element=\{<Login \/>\} \/>/);
    expect(login).toMatch(/signInWithPassword/);
    expect(login).toMatch(/navigate\("\/register"/);
    expect(login).toMatch(/to="\/forgot-password"/);
    expect(login).toMatch(/login_saved_email/);
    expect(login).toMatch(/login_save_details/);
    expect(login).toMatch(/removeItem\("login_saved_password"\)/);
    expect(login).not.toMatch(/elix-page-glass/);
    expect(login).not.toMatch(/LoginV2|LoginOld|LoginFixed|LoginBackup|history\.back|navigate\(-1\)/);
    expect(session).toMatch(/\/api\/auth\/login/);
    expect(session).toMatch(/productionLoginSuccessSchema/);
    expect(session).not.toMatch(/authSuccessSchema/);
    expect(contract).toMatch(/productionLoginSuccessSchema/);
    expect(contract).toMatch(/access_token/);
    expect(router).toMatch(/writeProductionLogin/);
    expect(router).toMatch(/access_token/);
    expect(router).toMatch(/Invalid login credentials\./);
    expect(features).toMatch(/VITE_EMAIL_CONFIGURED/);
    expect(features).toMatch(/VITE_APPLE_SIGN_IN_ENABLED/);
  });
});
