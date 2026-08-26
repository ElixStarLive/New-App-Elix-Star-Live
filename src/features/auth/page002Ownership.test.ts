import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("PAGE-002 Register ownership", () => {
  it("keeps a single Register page owner and OLD consent Neon shape", () => {
    const page = read("src/pages/Register.tsx");
    const consentMigration = read("server/migrations/20260825160000_user_consents_page002.sql");
    const authRouter = read("server/modules/auth/router.ts");
    const authSession = read("src/features/auth/authSession.ts");

    expect(page).toContain('to="/terms"');
    expect(page).toContain('to="/privacy"');
    expect(page).toContain("authSaveConsent");
    expect(page).toContain("signUpWithPassword");
    expect(page).not.toContain("login_saved_password");
    expect(page).not.toContain("dateOfBirth");
    expect(page).not.toContain("date_of_birth");

    expect(consentMigration).toContain("consent_type");
    expect(consentMigration).toContain("age_confirmed_13_plus");
    expect(consentMigration).toContain("DROP COLUMN IF EXISTS kind");

    expect(authRouter).toContain("INSERT INTO user_consents (user_id, consent_type, version, age_confirmed_13_plus, accepted_at, meta)");
    expect(authRouter).not.toContain("INSERT INTO user_consents (user_id, kind)");
    expect(authSession).toContain('consent_type: "terms_privacy_and_age_13_plus"');
    expect(authSession).toContain('version: "2026-07-21"');
    expect(authSession).toContain("age_confirmed_13_plus: true");
  });
});
