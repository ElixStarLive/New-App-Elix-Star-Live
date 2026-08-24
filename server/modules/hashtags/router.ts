import { Router } from "express";
import type { AuthedRequest } from "../../middleware/auth.js";
import { routeParam } from "../../http/param.js";
import { queryHashtagPage } from "./query.js";

const router = Router();

router.get("/:tag", async (req: AuthedRequest, res) => {
  res.json(await queryHashtagPage(req.userId ?? null, routeParam(req, "tag")));
});

export default router;
