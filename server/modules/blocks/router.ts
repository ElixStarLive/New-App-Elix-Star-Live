import { Router } from "express";
import { unblockUserBodySchema } from "../../../shared/contracts/social.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { deleteBlock, listBlockedUsers, type BlockedUserRow } from "./service.js";

function blockedUserWire(row: BlockedUserRow) {
  return {
    blocked_user_id: row.blockedUserId,
    username: row.username,
    display_name: row.displayName,
    avatar_url: row.avatarUrl,
    created_at: row.createdAt,
  };
}

const router = Router();

router.get("/blocked-users", requireAuth, async (req: AuthedRequest, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ data: (await listBlockedUsers(req.userId as string)).map(blockedUserWire) });
});

router.post("/unblock-user", requireAuth, async (req: AuthedRequest, res) => {
  const body = unblockUserBodySchema.parse(req.body ?? {});
  await deleteBlock(req.userId as string, body.blockedUserId);
  res.json({ success: true });
});

export default router;
