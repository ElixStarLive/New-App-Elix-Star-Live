import { Redis } from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

let main: Redis | null = null;
let pub: Redis | null = null;
let sub: Redis | null = null;

function connect(url: string, role: string): Redis {
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  client.on("error", (error) => logger.error({ err: error, role }, "valkey error"));
  return client;
}

function requireValkeyUrl(): string {
  const url = env().valkeyUrl;
  if (!url) {
    if (env().isProduction) {
      throw new Error("Valkey is required in production");
    }
    throw new Error("VALKEY_URL is not configured");
  }
  return url;
}

export function requireValkey(): Redis {
  const url = requireValkeyUrl();
  if (!main) main = connect(url, "main");
  return main;
}

export function valkeyPub(): Redis {
  if (!pub) pub = connect(requireValkeyUrl(), "pub");
  return pub;
}

export function valkeySub(): Redis {
  if (!sub) sub = connect(requireValkeyUrl(), "sub");
  return sub;
}

export async function valkeyTrySetNx(
  key: string,
  value: string,
  ttlMs: number,
): Promise<boolean> {
  const result = await requireValkey().set(key, value, "PX", ttlMs, "NX");
  return result === "OK";
}

export async function closeValkey(): Promise<void> {
  const results = await Promise.allSettled([main?.quit(), pub?.quit(), sub?.quit()]);
  main = null;
  pub = null;
  sub = null;
  for (const result of results) {
    if (result.status === "rejected") {
      logger.warn({ err: result.reason }, "valkey close failed");
    }
  }
}

export function valkey() {
  return requireValkey();
}
