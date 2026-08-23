import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const page = readFileSync(resolve(process.cwd(), "src/pages/CreatorLoginDetails.tsx"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/creatorLogin/creatorLoginSession.ts"), "utf8");
const storage = readFileSync(resolve(process.cwd(), "src/features/creatorLogin/creatorSavedAccounts.ts"), "utf8");
const shell = readFileSync(resolve(process.cwd(), "src/lib/appShell.ts"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");

describe("PAGE-029 creator login details ownership", () => {
  it("owns /creator/login-details with one session and local identifier list", () => {
    expect(app.match(/path="\/creator\/login-details"/g)?.length).toBe(1);
    expect(app).toMatch(/path="\/creator\/login-details" element=\{<CreatorLoginDetails \/>\}/);
    expect(app).toMatch(/path="\/forgot-password"/);
    expect(page).toMatch(/createCreatorLoginSession/);
    expect(page).toMatch(/Creator Login Details/);
    expect(page).not.toMatch(/Create account|login_saved_email|location\.reload|CreatorLoginDetailsOld|CreatorLoginDetailsV2/);
    expect(page).not.toMatch(/wsClient|new WebSocket|setTimeout/);
    expect(session).toMatch(/authResendConfirmation/);
    expect(session).not.toMatch(/setTimeout|location\.reload/);
    expect(storage).toMatch(/creator_saved_accounts/);
    expect(storage).toMatch(/creator_saved_password/);
    expect(storage).toMatch(/CREATOR_SAVED_ACCOUNT_LIMIT = 5/);
  });

  it("stays reachable after sign-out and exits to Settings", () => {
    expect(shell).toMatch(/pathname === "\/creator\/login-details"/);
    expect(nav).toMatch(/CREATOR_LOGIN_HOME/);
    expect(nav).toMatch(/\/creator\/login-details/);
  });
});
