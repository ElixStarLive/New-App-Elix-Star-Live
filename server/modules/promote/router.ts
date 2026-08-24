import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { completePromotePurchase } from "./complete.js";

const router = Router();

router.post("/promote-iap-complete", requireAuth, async (req: AuthedRequest, res) => {
  const result = await completePromotePurchase(req.userId as string, req.body);
  res.json(result);
});

export default router;
