import { Router } from "express";
import { deviceTokenDeleteBodySchema, deviceTokenRegisterBodySchema } from "../../../shared/contracts/push.js";
import { getPool } from "../../infra/postgres.js";
import { AppError } from "../../middleware/errors.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { isSchemaUnavailable } from "../engagement/settings.js";

const router = Router();

router.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const body = deviceTokenRegisterBodySchema.parse(req.body ?? {});
  try {
    const upserted = await getPool().query(
      `INSERT INTO device_tokens (user_id, platform, token)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, platform) DO UPDATE SET token = EXCLUDED.token
       RETURNING user_id`,
      [req.userId, body.platform, body.token],
    );
    if (!upserted.rowCount) {
      throw new AppError("DATABASE_UNAVAILABLE", "DATABASE_UNAVAILABLE", 503);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (isSchemaUnavailable(error)) {
      throw new AppError("SCHEMA_UNAVAILABLE", "SCHEMA_UNAVAILABLE", 503);
    }
    throw new AppError("DATABASE_UNAVAILABLE", "DATABASE_UNAVAILABLE", 503);
  }
  res.json({ ok: true });
});

router.delete("/", requireAuth, async (req: AuthedRequest, res) => {
  const body = deviceTokenDeleteBodySchema.parse(req.body ?? {});
  try {
    await getPool().query(`DELETE FROM device_tokens WHERE user_id = $1 AND platform = $2`, [
      req.userId,
      body.platform,
    ]);
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (isSchemaUnavailable(error)) {
      throw new AppError("SCHEMA_UNAVAILABLE", "SCHEMA_UNAVAILABLE", 503);
    }
    throw new AppError("DATABASE_UNAVAILABLE", "DATABASE_UNAVAILABLE", 503);
  }
  res.json({ ok: true });
});

export default router;
