import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("FLOW-024 promote ownership", () => {
  it("uses one IAP complete path, platform ledger only, and no Stripe or coin lots", () => {
    const panel = readFileSync(resolve(process.cwd(), "src/components/PromotePanel.tsx"), "utf8");
    const purchase = readFileSync(resolve(process.cwd(), "src/features/promote/promotePurchase.ts"), "utf8");
    const api = readFileSync(resolve(process.cwd(), "src/features/promote/promoteApi.ts"), "utf8");
    const complete = readFileSync(resolve(process.cwd(), "server/modules/promote/complete.ts"), "utf8");
    const player = readFileSync(resolve(process.cwd(), "src/components/ForYouPlayer.tsx"), "utf8");
    expect(panel).toMatch(/Promote/);
    expect(panel).toMatch(/data-elix-promote-video/);
    expect(player).toMatch(/<PromotePanel/);
    expect(api).toMatch(/\/api\/promote-iap-complete/);
    expect(purchase).toMatch(/purchasePromoteBoost/);
    expect(purchase).not.toMatch(/stripe|Stripe|\/api\/verify-purchase/);
    expect(complete).toMatch(/'promote_iap'/);
    expect(complete).toMatch(/platform_wallet_gbp/);
    expect(complete).not.toMatch(/paid_coin_lots|applyWalletDelta|insertPaidCoinLot/);
    expect(complete).not.toMatch(/stripe|Stripe/);
  });
});
