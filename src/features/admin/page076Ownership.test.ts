import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_WITHDRAWALS_SUBTITLE, ADMIN_WITHDRAWALS_TITLE } from "@/content/adminWithdrawals";

const page = readFileSync(resolve(process.cwd(), "src/pages/admin/Withdrawals.tsx"), "utf8");
const content = readFileSync(resolve(process.cwd(), "src/content/adminWithdrawals.ts"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/admin/adminApi.ts"), "utf8");
const withdrawals = readFileSync(resolve(process.cwd(), "server/modules/admin/withdrawals.ts"), "utf8");
const extra = readFileSync(resolve(process.cwd(), "server/modules/app/clientRoutes.ts"), "utf8");
const service = readFileSync(resolve(process.cwd(), "server/modules/payouts/service.ts"), "utf8");
const connect = readFileSync(resolve(process.cwd(), "server/modules/payouts/stripeConnect.ts"), "utf8");
const monetisation = readFileSync(resolve(process.cwd(), "server/modules/admin/monetisation.ts"), "utf8");
const purchases = readFileSync(resolve(process.cwd(), "server/modules/admin/purchases.ts"), "utf8");
const auth = readFileSync(resolve(process.cwd(), "server/middleware/auth.ts"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const dashboard = readFileSync(resolve(process.cwd(), "src/content/adminDashboard.ts"), "utf8");
const monetisationPage = readFileSync(resolve(process.cwd(), "src/pages/admin/Monetisation.tsx"), "utf8");
const rising = readFileSync(resolve(process.cwd(), "src/pages/admin/RisingStars.tsx"), "utf8");
const progression = readFileSync(resolve(process.cwd(), "src/pages/admin/Progression.tsx"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");

describe("PAGE-076 Admin Withdrawals ownership", () => {
  it("has one /admin/withdrawals owner behind the shared admin guard", () => {
    expect(app.match(/<Route path="\/admin\/withdrawals" /g)?.length).toBe(1);
    expect(app).toMatch(/<Route path="\/admin\/withdrawals" element=\{<AdminWithdrawals \/>\} \/>/);
    expect(app).toMatch(/<Route element=\{<RequireAdmin \/>\}>/);
    expect(ADMIN_WITHDRAWALS_TITLE).toBe("Withdrawals");
    expect(ADMIN_WITHDRAWALS_SUBTITLE).toMatch(/Manual review only/);
    expect(page).toMatch(/ADMIN_WITHDRAWALS_TITLE/);
    expect(page).toMatch(/ADMIN_WITHDRAWAL_ACTION_LABELS/);
    expect(page).not.toMatch(/PageScaffold|AdminTablePage|LegalDocPage|history\.back|navigate\(-1\)|location\.reload|setTimeout\(|setInterval\(/);
    expect(page).not.toMatch(/WebSocket|LiveKit|localStorage|sessionStorage|impersonat/);
    expect(content).not.toMatch(/coming soon|lorem ipsum|WithdrawalsV2/);
  });

  it("uses canonical withdrawals_gbp and users.is_admin only", () => {
    expect(api).toMatch(/\/api\/admin\/withdrawals\?status=/);
    expect(api).toMatch(/\/api\/admin\/withdrawals\/\$\{encodeURIComponent\(withdrawalId\)\}\/\$\{action\}/);
    expect(api).toMatch(/body: JSON\.stringify\(\{ adminNote: note \}\)/);
    expect(withdrawals).toMatch(/FROM withdrawals_gbp/);
    expect(withdrawals).toMatch(/FOR UPDATE/);
    expect(withdrawals).toMatch(/req\.userId/);
    expect(withdrawals).toMatch(/moderation_audit/);
    expect(withdrawals).toMatch(/withdrawal_approve:/);
    expect(withdrawals).toMatch(/withdrawal_reject:/);
    expect(withdrawals).toMatch(/withdrawal_cancel:/);
    expect(withdrawals).toMatch(/earning_chargeback:/);
    expect(withdrawals).not.toMatch(/SELECT \*/);
    expect(withdrawals).not.toMatch(/new Map\(|ADMIN_EMAIL|reviewedBy|adminId|status = \$req|available_pence = \$/);
    expect(withdrawals).not.toMatch(/VALKEY|valkey|stripe\.transfers|payouts\.create|sk_live/);
    expect(extra).toMatch(/handleAdminWithdrawals/);
    expect(extra).toMatch(/handleAdminWithdrawalAction/);
    expect(extra).toMatch(/\.post\("\/withdrawals\/:id\/review"/);
    expect(extra).toMatch(/\.post\("\/withdrawals\/:id\/approve"/);
    expect(extra).toMatch(/\.post\("\/withdrawals\/:id\/reject"/);
    expect(extra).toMatch(/\.post\("\/withdrawals\/:id\/cancel"/);
    expect(extra).toMatch(/\.post\("\/withdrawals\/:id\/mark-paid"/);
    expect(extra).toMatch(/\.post\("\/chargeback"/);
    expect(extra).toMatch(/\.post\("\/unfreeze\/:userId"/);
    expect(extra).not.toMatch(/SELECT \* FROM withdrawals_gbp/);
    expect(auth).toMatch(/SELECT is_admin FROM users/);
    expect(dashboard).toMatch(/path: "\/admin\/withdrawals"/);
    expect(service).toMatch(/held_pence = held_pence \+ \$2/);
    expect(service).toMatch(/withdrawal_hold:/);
    expect(connect).toMatch(/payouts_enabled/);
    expect(ws).toMatch(/class WsClient/);
    expect(page).not.toMatch(/new WebSocket|reconnectOnForeground/);
    expect(page).toMatch(/prev\.length === 0|!prev \|\| prev\.length === 0/);
    expect(app.indexOf("<Route element={<RequireAdmin")).toBeGreaterThan(app.indexOf("<Route element={<RequireAuth"));
  });

  it("does not take later admin pages or invent a second payout rail", () => {
    expect(page).not.toMatch(/Chargeback|Unfreeze|Rising Stars|Starter Coins|feature-flags/);
    expect(page).not.toMatch(/apiAdminPatchMonetisationConfig|apiAdminUpdateGiftPrice|apiAdminBanUser/);
    expect(page).not.toMatch(/Submit Stripe|payouts\.create|transfers\.create/);
    expect(monetisationPage).not.toMatch(/apiAdminWithdrawalAction|apiFetchAdminWithdrawals/);
    expect(monetisation).not.toMatch(/UPDATE withdrawals_gbp|UPDATE creator_wallet_gbp/);
    expect(purchases).not.toMatch(/UPDATE withdrawals_gbp|earning_chargeback/);
    expect(rising).toMatch(/ADMIN_RISING_STARS_TITLE/);
    expect(rising).not.toMatch(/apiAdminWithdrawalAction|withdrawals_gbp/);
    expect(progression).toMatch(/ADMIN_PROGRESSION_TITLE/);
    expect(progression).not.toMatch(/AdminTablePage/);
    expect(withdrawals).not.toMatch(/UPDATE shop_purchases|UPDATE processed_purchases|UPDATE paid_coin_lots/);
    expect(withdrawals).not.toMatch(/banned_until|rs_challenges|engagement_missions/);
  });
});
