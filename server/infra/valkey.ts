import { Redis } from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

let main: Redis | null = null;
let pub: Redis | null = null;
let sub: Redis | null = null;

function connect(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });
}

export function requireValkey(): Redis {
  const url = env().valkeyUrl;
  if (!url) {
    if (env().isProduction) {
      throw new Error("Valkey is required in production");
    }
    throw new Error("VALKEY_URL is not configured");
  }
  if (!main) {
    main = connect(url);
    main.on("error", (error) => logger.error({ err: error }, "valkey error"));
  }
  return main;
}

export function valkeyPub(): Redis {
  if (!pub) pub = connect(env().valkeyUrl ?? "");
  return pub;
}

export function valkeySub(): Redis {
  if (!sub) sub = connect(env().valkeyUrl ?? "");
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
  await Promise.all([main?.quit(), pub?.quit(), sub?.quit()]);
  main = null;
  pub = null;
  sub = null;
}

export function valkey() {
  return requireValkey();
}
