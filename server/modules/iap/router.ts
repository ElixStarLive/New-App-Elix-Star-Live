import { Router } from "express";
import type { Response } from "express";
import type { AuthedRequest } from "../../middleware/auth.js";
import { creditVerifiedIap } from "./credit.js";
import { handleGetCoinPackages } from "./catalog.js";

const router = Router();

async function handleVerifyPurchase(req: AuthedRequest, res: Response): Promise<void> {
  const result = await creditVerifiedIap(req.userId as string, req.body);
  res.json({
    ok: true,
    success: true,
    coins: result.coins,
    newBalance: result.paidCoins,
    paidCoins: result.paidCoins,
    promoCoins: result.promoCoins,
    starterCoins: result.starterCoins,
    deduplicated: result.deduplicated,
  });
}

export { handleGetCoinPackages, handleVerifyPurchase };
export default router;
