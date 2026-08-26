/**
 * PAGE-029 runtime proof — creator login details against NEW API + Neon.
 * Run: npx tsx scripts/_page029_creator_login_runtime_proof.ts
 * Device PASS not claimed.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

process.env.VALKEY_URL = process.env.VALKEY_URL || "redis://127.0.0.1:6379";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { closeValkey, requireValkey } = await import("../server/infra/valkey.ts");
const { getPool } = await import("../server/infra/postgres.ts");
const {
  CREATOR_SAVED_ACCOUNT_LIMIT,
  CREATOR_SAVED_ACCOUNTS_KEY,
  clearAllLegacyCreatorLoginKeys,
  readCreatorSavedAccounts,
  upsertCreatorSavedAccount,
  writeCreatorSavedAccounts,
} = await import("../src/features/creatorLogin/creatorSavedAccounts.ts");

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";

type CreatorAccountStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

async function json(path: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function accessToken(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const session = (body as { session?: { access_token?: unknown } }).session;
  if (!session || typeof session !== "object") return "";
  return typeof session.access_token === "string" ? session.access_token : "";
}

function memoryStorage(seed: Record<string, string> = {}): CreatorAccountStorage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

async function register(stamp: string) {
  const username = `p29${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
  const email = `${username}@example.com`;
  const password = "password12";
  const registered = await json("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      username,
      password,
      ageConfirmed13Plus: true,
      consentVersion: "2026-07-21",
    }),
  });
  assert(registered.status === 201, `register ${username} → ${registered.status}`);
  const id = String((registered.body as { user?: { id?: string } })?.user?.id ?? "");
  assert(Boolean(id), "register missing user id");
  await getPool()!.query(`UPDATE users SET email_confirmed_at = NOW() WHERE id = $1`, [id]);
  const login = await json("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  assert(login.status === 200, `login ${username} → ${login.status}`);
  const token = accessToken(login.body);
  assert(Boolean(token), "login missing access_token");
  return { id, token, username, email, password };
}

try {
  const page = readFileSync(resolve("src/pages/CreatorLoginDetails.tsx"), "utf8");
  const sessionSrc = readFileSync(resolve("src/features/creatorLogin/creatorLoginSession.ts"), "utf8");
  const storageSrc = readFileSync(resolve("src/features/creatorLogin/creatorSavedAccounts.ts"), "utf8");
  const loginSrc = readFileSync(resolve("src/pages/Login.tsx"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const authSession = readFileSync(resolve("src/features/auth/authSession.ts"), "utf8");
  const authStore = readFileSync(resolve("src/store/useAuthStore.ts"), "utf8");

  assert(app.includes('path="/creator/login-details" element={<CreatorLoginDetails />}'), "route missing");
  assert(page.includes("signInWithPassword"), "must reuse PAGE-001 auth store login");
  assert(!page.includes("Create account"), "Create account not in OLD PAGE-029");
  assert(sessionSrc.includes("clearAllLegacyCreatorLoginKeys"), "legacy purge missing");
  assert(storageSrc.includes("CREATOR_SAVED_ACCOUNT_LIMIT = 5"), "max 5 missing");
  assert(storageSrc.includes('removeItem("login_saved_password")'), "login password purge missing");
  assert(!loginSrc.includes("setItem(REMEMBER_PASSWORD_KEY"), "PAGE-001 must not write passwords");
  assert(loginSrc.includes("removeItem(REMEMBER_PASSWORD_KEY)"), "PAGE-001 must delete legacy passwords");
  assert(authSession.includes("/api/auth/login"), "canonical login contract missing");
  assert(authSession.includes("/api/auth/me"), "canonical me contract missing");
  assert(authStore.includes("isolateWalletAccount"), "wallet isolation on auth missing");
  assert(authStore.includes("signOut"), "canonical signOut missing");

  await requireValkey().ping();
  const health = await json("/api/health");
  assert(health.status === 200, `health ${health.status}`);

  const accountA = await register("a");
  const accountB = await register("b");

  const storage = memoryStorage();
  storage.setItem("creator_saved_password", "injected-secret");
  storage.setItem("login_saved_password", "injected-login-secret");
  clearAllLegacyCreatorLoginKeys(storage);
  assert(storage.getItem("creator_saved_password") === null, "creator_saved_password survived purge");
  assert(storage.getItem("login_saved_password") === null, "login_saved_password survived purge");

  for (let i = 0; i < CREATOR_SAVED_ACCOUNT_LIMIT; i += 1) {
    upsertCreatorSavedAccount(storage, {
      identifier: `slot${i}@example.com`,
      username: `slot${i}`,
    });
  }
  upsertCreatorSavedAccount(storage, {
    identifier: "sixth@example.com",
    username: "sixth",
  });
  const capped = readCreatorSavedAccounts(storage);
  assert(capped.length === 5, `expected max 5, got ${capped.length}`);
  assert(capped[0]?.identifier === "sixth@example.com", "newest should be first");
  assert(!capped.some((row) => row.identifier === "slot0@example.com"), "oldest should be evicted");
  assert(capped.length === CREATOR_SAVED_ACCOUNT_LIMIT, "still capped at 5 after 6th");

  writeCreatorSavedAccounts(storage, []);
  clearAllLegacyCreatorLoginKeys(storage);

  // PAGE-029 login success path: POST /api/auth/login then upsert identifier-only row.
  const loginA = await json("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: accountA.email, password: accountA.password }),
  });
  assert(loginA.status === 200, `A login ${loginA.status}`);
  const tokenA = accessToken(loginA.body);
  upsertCreatorSavedAccount(storage, {
    identifier: accountA.email,
    username: accountA.username,
  });
  clearAllLegacyCreatorLoginKeys(storage);

  const meA = await json("/api/auth/me", { headers: { Authorization: `Bearer ${tokenA}` } });
  assert(meA.status === 200, `A /me ${meA.status}`);
  assert(
    String((meA.body as { user?: { email?: string } })?.user?.email || "") === accountA.email,
    "A /me email mismatch",
  );

  const savedAfterA = readCreatorSavedAccounts(storage);
  assert(savedAfterA.some((row) => row.identifier === accountA.email), "A identifier not saved");
  assert(!JSON.stringify(savedAfterA).includes(accountA.password), "A password leaked into storage");

  // Switch requires real re-auth as B (no stored password).
  const loginB = await json("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: accountB.email, password: accountB.password }),
  });
  assert(loginB.status === 200, `B login ${loginB.status}`);
  const tokenB = accessToken(loginB.body);
  upsertCreatorSavedAccount(storage, {
    identifier: accountB.email,
    username: accountB.username,
  });
  clearAllLegacyCreatorLoginKeys(storage);

  const meB = await json("/api/auth/me", { headers: { Authorization: `Bearer ${tokenB}` } });
  assert(meB.status === 200, `B /me ${meB.status}`);
  assert(
    String((meB.body as { user?: { email?: string } })?.user?.email || "") === accountB.email,
    "B /me email mismatch",
  );
  assert(
    String((meB.body as { user?: { id?: string } })?.user?.id || "") === accountB.id,
    "B /me id mismatch — session isolation failed",
  );

  const savedAfterB = readCreatorSavedAccounts(storage);
  assert(savedAfterB[0]?.identifier === accountB.email, "B should be front of saved list");
  assert(savedAfterB.some((row) => row.identifier === accountA.email), "A should remain saved");
  assert(!JSON.stringify(savedAfterB).includes(accountA.password), "A password after switch");
  assert(!JSON.stringify(savedAfterB).includes(accountB.password), "B password after switch");
  assert(!JSON.stringify(savedAfterB).includes('"password"'), "password field in saved JSON");

  const bad = await json("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: accountA.email, password: "wrong-password" }),
  });
  assert(bad.status === 401 || bad.status === 400, `invalid credentials should fail, got ${bad.status}`);

  // Inject legacy password mid-session and prove purge.
  storage.setItem("login_saved_password", "late-inject");
  storage.setItem("creator_saved_password", "late-inject-2");
  clearAllLegacyCreatorLoginKeys(storage);
  assert(storage.getItem("login_saved_password") === null, "late login password survived");
  assert(storage.getItem("creator_saved_password") === null, "late creator password survived");

  const rawKey = storage.getItem(CREATOR_SAVED_ACCOUNTS_KEY) || "";
  assert(!rawKey.includes("password12"), "storage blob must not contain runtime password");
  assert(!rawKey.includes("injected"), "injected secrets must be gone");

  console.log("PAGE-029 runtime proof PASS");
  console.log(
    JSON.stringify(
      {
        route: "/creator/login-details",
        accounts: [accountA.email, accountB.email],
        savedCount: savedAfterB.length,
        max: CREATOR_SAVED_ACCOUNT_LIMIT,
        passwordKeysAbsent: true,
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error("PAGE-029 runtime proof FAIL", err);
  process.exitCode = 1;
} finally {
  try {
    await closeValkey();
  } catch {
    /* ignore */
  }
  try {
    await getPool()?.end();
  } catch {
    /* ignore */
  }
}
