/**
 * Server entrypoint.
 *
 * Configuration is validated by importing `config`, which throws on anything
 * missing, before a listener is opened. Migrations run before the port is bound
 * so an instance never serves requests against a schema it has not confirmed.
 */

import { config } from './config.js';
import { logger } from './lib/logger.js';
import { closePool, isDatabaseHealthy } from './lib/postgres.js';
import { closeValkey, isValkeyHealthy } from './lib/valkey.js';
import { runMigrations } from './migrate.js';
import { createApp } from './http/app.js';

async function waitFor<T>(
  name: string,
  check: () => Promise<T | false | null | undefined>,
  { attempts = 40, delayMs = 500 } = {},
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    const result = await check();
    if (result) return result as T;
    if (i < attempts - 1) {
      logger.debug({ attempt: i + 1, name }, 'waiting for dependency');
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`${name} not ready after ${attempts} attempts — check env`);
}

async function main(): Promise<void> {
  await waitFor('database', isDatabaseHealthy);
  await waitFor('valkey', isValkeyHealthy);

  const { applied } = await runMigrations();
  logger.info({ applied: applied.length }, 'schema ready');

  const server = createApp().listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'server listening');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutting down');
    server.close(() => {
      void Promise.allSettled([closePool(), closeValkey()]).then(() => process.exit(0));
    });
    // A connection that will not drain must not hold the deploy open forever.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'server failed to start');
  // console.error is synchronous and flushed before exit, so the actual error
  // reaches the container logs even if pino has not finished writing.
  console.error('FATAL:', err);
  process.exit(1);
});
