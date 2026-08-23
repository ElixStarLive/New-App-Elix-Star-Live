import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import {
  getCreatorBalance,
  listCreatorLedger,
  listCreatorWithdrawals,
  listPayoutMethods,
  requestCreatorWithdrawal,
  savePayoutMethod,
} from "../payouts/service.js";
import { createConnectOnboardingLink, getPayoutAccountStatus } from "../payouts/stripeConnect.js";

const router = Router();

function noStore(res: { setHeader: (name: string, value: string) => void }) {
  res.setHeader("Cache-Control", "private, no-store");
}

router.get("/balance", requireAuth, async (req: AuthedRequest, res) => {
  noStore(res);
  res.json(await getCreatorBalance(req.userId as string));
});

router.get("/ledger", requireAuth, async (req: AuthedRequest, res) => {
  noStore(res);
  res.json(await listCreatorLedger(req.userId as string));
});

router.get("/withdrawals-gbp", requireAuth, async (req: AuthedRequest, res) => {
  noStore(res);
  res.json(await listCreatorWithdrawals(req.userId as string));
});

router.get("/payout-methods", requireAuth, async (req: AuthedRequest, res) => {
  noStore(res);
  res.json(await listPayoutMethods(req.userId as string));
});

router.post("/payout-method", requireAuth, async (req: AuthedRequest, res) => {
  res.json(await savePayoutMethod(req.userId as string, req.body));
});

router.get("/payout-account", requireAuth, async (req: AuthedRequest, res) => {
  noStore(res);
  res.json(await getPayoutAccountStatus(req.userId as string));
});

router.post("/payout-account/onboard", requireAuth, async (req: AuthedRequest, res) => {
  void req.body;
  res.json(await createConnectOnboardingLink(req.userId as string));
});

router.post("/withdraw-gbp", requireAuth, async (req: AuthedRequest, res) => {
  res.json(await requestCreatorWithdrawal(req.userId as string, req.body));
});

export default router;
