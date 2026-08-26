import { logger } from "./logger.js";

let installed = false;

export function installProcessErrorHandlers(): void {
  if (installed) return;
  installed = true;
  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "unhandled promise rejection");
  });
  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "uncaught exception; exiting");
    process.exit(1);
  });
}
