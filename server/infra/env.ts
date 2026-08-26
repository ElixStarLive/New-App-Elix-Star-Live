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

function resolveValkeyUrl(
  parsed: z.infer<typeof envSchema>,
  merged: Record<string, string | undefined>,
): string | null {
  // server/http.it.test.ts harness: local disposable Postgres only — never inherit
  // production Valkey from developer .env unless TEST_VALKEY_URL is explicitly set.
  if (parsed.NODE_ENV === "test" && merged.TEST_DATABASE_URL?.trim()) {
    const testValkey = merged.TEST_VALKEY_URL?.trim();
    if (testValkey) return testValkey;
    const raw = parsed.VALKEY_URL?.trim() || parsed.REDIS_URL?.trim() || "";
    return raw || null;
  }
  const raw = parsed.VALKEY_URL?.trim() || parsed.REDIS_URL?.trim() || "";
  return raw || null;
}

function resolveIntegrationOverride(
  parsed: z.infer<typeof envSchema>,
  merged: Record<string, string | undefined>,
  testKey: string | undefined,
  liveKeys: Array<string | undefined>,
): string | undefined {
  if (parsed.NODE_ENV === "test" && merged.TEST_DATABASE_URL?.trim()) {
    return testKey?.trim() || undefined;
  }
  for (const key of liveKeys) {
    const trimmed = key?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

export function loadEnv(overrides: Record<string, string | undefined> = {}): Env {
  const merged = { ...process.env, ...overrides };
  const parsed = envSchema.parse(merged);
  const valkeyUrl = resolveValkeyUrl(parsed, merged);
  const isProduction = parsed.NODE_ENV === "production";
  const stripeSecretKey = resolveIntegrationOverride(
    parsed,
    merged,
    merged.TEST_STRIPE_SECRET_KEY,
    [parsed.STRIPE_SECRET_KEY],
  );
  const stripeWebhookSecret = resolveIntegrationOverride(
    parsed,
    merged,
    merged.TEST_STRIPE_WEBHOOK_SECRET,
    [parsed.STRIPE_WEBHOOK_SECRET],
  );
  if (isProduction && !valkeyUrl) {
    throw new Error("VALKEY_URL is required in production");
  }
  if (isProduction && !(parsed.LIVEKIT_URL?.trim() && parsed.LIVEKIT_API_KEY?.trim() && parsed.LIVEKIT_API_SECRET?.trim())) {
    throw new Error("LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET are required in production");
  }
  if (isProduction && !(parsed.BUNNY_STORAGE_ZONE?.trim() && parsed.BUNNY_STORAGE_API_KEY?.trim() && parsed.BUNNY_CDN_HOSTNAME?.trim())) {
    throw new Error("BUNNY_STORAGE_ZONE, BUNNY_STORAGE_API_KEY, and BUNNY_CDN_HOSTNAME are required in production");
  }
  if (isProduction) {
    const fakeMarkers = ["integration-key", "cdn.test", "integration-zone"];
    const joined = [
      parsed.BUNNY_STORAGE_API_KEY,
      parsed.BUNNY_CDN_HOSTNAME,
      parsed.BUNNY_STORAGE_ZONE,
      parsed.LIVEKIT_URL,
      parsed.LIVEKIT_API_KEY,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    for (const marker of fakeMarkers) {
      if (joined.includes(marker)) {
        throw new Error(`Production env contains forbidden test/fake marker: ${marker}`);
      }
    }
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
  const env: Env = {
    ...parsed,
    STRIPE_SECRET_KEY: stripeSecretKey,
    STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
    valkeyUrl,
    isProduction,
  };
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
