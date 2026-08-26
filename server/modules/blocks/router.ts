import { Router } from "express";
import { unblockUserBodySchema } from "../../../shared/contracts/social.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { deleteBlock, listBlockedUsers } from "./service.js";

const router = Router();

router.get("/blocked-users", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  // NEW wire = camelCase blockedUserRowSchema (not OLD snake_case).
  res.json({ data: await listBlockedUsers(req.userId as string) });
});

router.post("/unblock-user", requireAuth, async (req: AuthedRequest, res) => {
  const body = unblockUserBodySchema.parse(req.body ?? {});
  await deleteBlock(req.userId as string, body.blockedUserId);
  res.json({ success: true });
});

export default router;
