import "dotenv/config";
import { loadEnv } from "./infra/env.js";
import { applyPendingMigrations } from "./infra/postgres.js";
import { logger } from "./infra/logger.js";

loadEnv();
const applied = await applyPendingMigrations();
logger.info({ applied }, "migrations complete");
