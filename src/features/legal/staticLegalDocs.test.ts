import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readPublic(name: string) {
  return readFileSync(resolve(root, "public", name), "utf8");
}

describe("independently written static legal / support documents", () => {
  it("keeps the dark-panel visual contract without the copied OLD stylesheet text", () => {
    const css = readPublic("legal-doc.css");
    expect(css).toContain("--elix-legal-page: #111111");
    expect(css).toContain("--elix-legal-gold: #d4af37");
    expect(css).toContain("max-width: var(--elix-legal-max)");
    expect(css).not.toContain("matches Community Guidelines dark panel");
  });

  it("keeps published legal prose on terms and privacy", () => {
    const terms = readPublic("terms.html");
    const privacy = readPublic("privacy.html");
    expect(terms).toContain("Terms of Service");
    expect(terms).toContain("Last updated: July 23, 2026");
    expect(terms).toContain("<article>");
    expect(terms).toContain("Elix Star Live Ltd");
    expect(privacy).toContain("Privacy Policy");
    expect(privacy).toContain("Last updated: July 21, 2026");
    expect(privacy).toContain("UK Information Commissioner's Office");
  });

  it("keeps support and supplier light-theme presentation independently", () => {
    const support = readPublic("support.html");
    const supplier = readPublic("supplier-agreement.html");
    expect(support).toContain("--elix-support-ink: #222");
    expect(support).toContain("Elix Star Live Support");
    expect(support).toContain("Email support");
    expect(supplier).toContain("--elix-supplier-ink: #333");
    expect(supplier).toContain("Supplier Agreement");
    expect(supplier).toContain("Last updated: July 15, 2026");
  });

  it("does not leave leftover iframe legal wrappers in production", () => {
    expect(existsSync(resolve(root, "src/pages/LegalDocPage.tsx"))).toBe(false);
    expect(existsSync(resolve(root, "src/components/PageScaffold.tsx"))).toBe(false);
    expect(existsSync(resolve(root, "src/pages/admin/AdminTablePage.tsx"))).toBe(false);
    expect(existsSync(resolve(root, "src/pages/settings/SettingsSubpage.tsx"))).toBe(false);
  });
});
