import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  VALKEY_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  BUNNY_STORAGE_ZONE: z.string().optional(),
  BUNNY_STORAGE_API_KEY: z.string().optional(),
  BUNNY_CDN_HOSTNAME: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  CLIENT_URL: z.string().optional(),
  APPLE_BUNDLE_ID: z.string().default("com.elixstarlive.app"),
  APPLE_SIGN_IN_ENABLED: z.string().optional(),
  ELIX_JOB_WORKER: z.string().optional(),
});

export type Env = z.infer<typeof envSchema> & {
  valkeyUrl: string | null;
  isProduction: boolean;
};

let cached: Env | null = null;

export function loadEnv(overrides: Record<string, string | undefined> = {}): Env {
  const merged = { ...process.env, ...overrides };
  const parsed = envSchema.parse(merged);
  const valkeyUrl = parsed.VALKEY_URL || parsed.REDIS_URL || null;
  const isProduction = parsed.NODE_ENV === "production";
  if (isProduction && !valkeyUrl) {
    throw new Error("VALKEY_URL is required in production");
  }
  if (isProduction && parsed.JWT_SECRET.length < 64) {
    throw new Error("JWT_SECRET must be at least 64 hex chars in production");
  }
  if (isProduction) {
    const raw = (parsed.CLIENT_URL || "").trim();
    let valid = false;
    if (raw) {
      try {
        const url = new URL(raw);
        valid = url.protocol === "https:" && !/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname);
      } catch {
        valid = false;
      }
    }
    if (!valid) {
      throw new Error("CLIENT_URL must be a public https origin in production");
    }
  }
  const env: Env = { ...parsed, valkeyUrl, isProduction };
  cached = env;
  return env;
}

export function env(): Env {
  if (!cached) return loadEnv();
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}
