import "dotenv/config";
import cluster from "node:cluster";
import os from "node:os";
import { loadEnv } from "./infra/env.js";
import { applyPendingMigrations } from "./infra/postgres.js";
import { logger } from "./infra/logger.js";
import { installProcessErrorHandlers } from "./infra/processErrors.js";

loadEnv();
installProcessErrorHandlers();

try {
  if (cluster.isPrimary) {
    await applyPendingMigrations();
    const workers = Math.min(os.cpus().length, 8);
    logger.info({ workers }, "forking workers after migrations");
    for (let i = 0; i < workers; i += 1) cluster.fork();
    cluster.on("exit", (worker, code, signal) => {
      logger.warn({ pid: worker.process.pid, code, signal }, "worker exited; reforking");
      cluster.fork();
    });
  } else {
    const { startServer } = await import("./index.js");
    await startServer();
  }
} catch (error) {
  logger.fatal({ err: error, primary: cluster.isPrimary }, "cluster boot failed");
  process.exit(1);
}
