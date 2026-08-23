import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/CreatorPayout.tsx"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/creator/creatorPayoutApi.ts"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/creator/creatorPayoutSession.ts"), "utf8");
const service = readFileSync(resolve(process.cwd(), "server/modules/payouts/service.ts"), "utf8");
const connect = readFileSync(resolve(process.cwd(), "server/modules/payouts/stripeConnect.ts"), "utf8");
const creatorRouter = readFileSync(resolve(process.cwd(), "server/modules/creator/router.ts"), "utf8");
const wallet = readFileSync(resolve(process.cwd(), "server/modules/wallet/router.ts"), "utf8");
const clientRoutes = readFileSync(resolve(process.cwd(), "server/modules/app/clientRoutes.ts"), "utf8");
const index = readFileSync(resolve(process.cwd(), "server/index.ts"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const settings = readFileSync(resolve(process.cwd(), "src/pages/Settings.tsx"), "utf8");
const settle = readFileSync(resolve(process.cwd(), "server/modules/gifts/settle.ts"), "utf8");
const gifts = readFileSync(resolve(process.cwd(), "server/modules/gifts/router.ts"), "utf8");
const reverse = readFileSync(resolve(process.cwd(), "server/modules/iap/reverse.ts"), "utf8");
const shop = readFileSync(resolve(process.cwd(), "server/modules/shop/router.ts"), "utf8");
const webhook = readFileSync(resolve(process.cwd(), "server/modules/webhooks/handlers.ts"), "utf8");
const money = readFileSync(resolve(process.cwd(), "shared/contracts/money.ts"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");

describe("PAGE-045 Creator Payout ownership", () => {
  it("has one /settings/payout option-sheet owner", () => {
    expect(app.match(/path="\/settings\/payout"/g)?.length).toBe(1);
    expect(app).not.toMatch(/path="\/payout"|path="\/creator\/payout"|path="\/wallet\/payout"|path="\/creator-payout"/);
    expect(page).toMatch(/SettingsOptionSheet/);
    expect(page).toMatch(/title="Creator Payout"/);
    expect(page).not.toMatch(/SettingsSubpage|CreatorPayoutV2|PayoutFixed/);
    expect(page).not.toMatch(/history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/WebSocket|wsClient|new WebSocket/);
    expect(page).not.toMatch(/localStorage|sessionStorage|sk_live|sk_test|STRIPE_SECRET/);
    expect(settings).toMatch(/go\("\/settings\/payout"\)/);
    expect(nav).toMatch(/if \(path === SETTINGS_HOME\) return SETTINGS_EXIT_TO/);
  });

  it("uses one creator GBP owner and does not calculate 60/40 on the client", () => {
    expect(api).toMatch(/\/api\/creator\/balance/);
    expect(api).toMatch(/\/api\/creator\/ledger/);
    expect(api).toMatch(/\/api\/creator\/withdrawals-gbp/);
    expect(api).toMatch(/\/api\/creator\/payout-methods/);
    expect(api).toMatch(/\/api\/creator\/payout-account/);
    expect(api).toMatch(/\/api\/creator\/payout-account\/onboard/);
    expect(api).toMatch(/\/api\/creator\/withdraw-gbp/);
    expect(api).not.toMatch(/\/api\/payouts\/withdraw|\/api\/wallet\/withdraw/);
    expect(page).not.toMatch(/\/api\/payouts\/withdraw|availablePence|setAvailable/);
    expect(page).not.toMatch(/\*\s*0\.6|\*\s*0\.60|\/\s*100\s*\*\s*0\.6/);
    expect(session).not.toMatch(/\*\s*0\.6|localStorage|sessionStorage|location\.reload|setTimeout\(/);
    expect(session).not.toMatch(/available_pence\s*\+=|creatorBalance\s*\+=/);
    expect(creatorRouter).toMatch(/router\.get\("\/balance"/);
    expect(creatorRouter).toMatch(/router\.post\("\/withdraw-gbp"/);
    expect(creatorRouter).toMatch(/req\.userId/);
    expect(service).toMatch(/held_pence = held_pence \+ \$2/);
    expect(service).toMatch(/'pending'/);
    expect(service).not.toMatch(/withdrawn_pence = withdrawn_pence \+/);
    expect(wallet).not.toMatch(/router\.post\("\/withdraw"/);
    expect(clientRoutes).not.toMatch(/payoutsRouter/);
    expect(clientRoutes).not.toMatch(/payoutsRouter\.post\("\/withdraw"/);
    expect(index).not.toMatch(/\/api\/payouts|payoutsRouter/);
    expect(money).not.toMatch(/withdrawalBodySchema|amountPence/);
  });

  it("keeps Stripe Connect, settlement, wallet, shop, and admin boundaries separate", () => {
    expect(connect).toMatch(/accounts\.retrieve/);
    expect(connect).toMatch(/payouts_enabled/);
    expect(connect).toMatch(/\/settings\/payout\?payout_return=1/);
    expect(connect).toMatch(/payouts_enabled: false/);
    expect(connect).not.toMatch(/req\.body|accountId.*body/);
    expect(settle).toMatch(/splitGiftPence/);
    expect(settle).toMatch(/gift_creator_pct/);
    expect(gifts).toMatch(/bucket === "paid"/);
    expect(gifts).toMatch(/bucket === "test"/);
    expect(reverse).toMatch(/status = 'reversed'/);
    expect(shop).toMatch(/checkout|Checkout/i);
    expect(shop).not.toMatch(/payout-account\/onboard|withdraw-gbp/);
    expect(webhook).toMatch(/account\.updated/);
    expect(clientRoutes).toMatch(/extraAdminRouter\.get\("\/withdrawals"/);
    expect(wallet).toMatch(/router\.get\("\/"/);
    expect(app).toMatch(/ownerId: "app-feed-presence"/);
    expect(page).not.toMatch(/new WebSocket/);
  });
});
