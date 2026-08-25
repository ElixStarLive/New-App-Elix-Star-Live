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
  requireValkey();
  if (!pub) {
    pub = connect(env().valkeyUrl as string);
    pub.on("error", (error) => logger.error({ err: error }, "valkey pub error"));
  }
  return pub;
}

export function valkeySub(): Redis {
  requireValkey();
  if (!sub) {
    sub = connect(env().valkeyUrl as string);
    sub.on("error", (error) => logger.error({ err: error }, "valkey sub error"));
  }
  return sub;
}

export async function valkeySet(key: string, value: string, ttlMs: number): Promise<void> {
  await requireValkey().set(key, value, "PX", ttlMs);
}

export async function valkeyGet(key: string): Promise<string | null> {
  return requireValkey().get(key);
}

export async function valkeyDel(key: string): Promise<void> {
  await requireValkey().del(key);
}

export async function valkeyTrySetNx(
  key: string,
  value: string,
  ttlMs: number,
): Promise<boolean> {
  const result = await requireValkey().set(key, value, "PX", ttlMs, "NX");
  return result === "OK";
}

export async function valkeySadd(key: string, member: string, ttlMs: number): Promise<void> {
  const redis = requireValkey();
  await redis.sadd(key, member);
  await redis.pexpire(key, ttlMs);
}

export async function valkeySrem(key: string, member: string): Promise<number> {
  return requireValkey().srem(key, member);
}

export async function valkeyScard(key: string): Promise<number> {
  return requireValkey().scard(key);
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
