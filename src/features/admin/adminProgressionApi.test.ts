import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const api = readFileSync(resolve(process.cwd(), "src/features/admin/adminApi.ts"), "utf8");

describe("PAGE-078 admin progression API", () => {
  it("uses the exact OLD admin progression paths and no dump GET", () => {
    expect(api).toMatch(/\/api\/admin\/progression\/config/);
    expect(api).toMatch(/\/api\/admin\/progression\/levels/);
    expect(api).toMatch(/\/api\/admin\/progression\/users\/\$\{encodeURIComponent\(userId\)\}/);
    expect(api).toMatch(/\/api\/admin\/progression\/\$\{endpoint\}/);
    expect(api).toMatch(/xp-adjustments/);
    expect(api).toMatch(/starter-adjustments/);
    expect(api).toMatch(/\/api\/admin\/progression\/feature-flags/);
    expect(api).toMatch(/\/api\/admin\/progression\/missions\/\$\{encodeURIComponent\(missionId\)\}/);
    expect(api).toMatch(/\/api\/admin\/progression\/missions\/\$\{encodeURIComponent\(missionId\)\}\/archive/);
    expect(api).toMatch(/\/api\/admin\/progression\/daily-rewards/);
    expect(api).toMatch(/\/api\/admin\/progression\/daily-rewards\/policy/);
    expect(api).toMatch(/\/api\/admin\/progression\/battle-energy-caps/);
    expect(api).toMatch(/\/api\/admin\/progression\/audit-history\?limit=30/);
    expect(api).not.toMatch(/apiRequest<unknown>\("\/api\/admin\/progression"\)/);
    expect(api).not.toMatch(/localStorage|sessionStorage|adminId|ADMIN_EMAIL/);
  });
});
