/**
 * PAGE-043 runtime proof — device-token POST/DELETE ownership, isolation, Neon upsert.
 * Run: npx tsx scripts/_page043_notifications_runtime_proof.ts
 * Real FCM/APNs delivery requires a physical device + provider credentials (reported separately).
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

delete process.env.TEST_DATABASE_URL;
if (process.env.NODE_ENV === "test") process.env.NODE_ENV = "development";

process.env.VALKEY_URL = process.env.VALKEY_URL || "redis://127.0.0.1:6379";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { getPool } = await import("../server/infra/postgres.ts");
const { isPushConfigured } = await import("../server/modules/push/send.ts");

const base = process.env.PROOF_API_BASE?.trim() || "http://127.0.0.1:8080";

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

async function register(stamp: string) {
  const username = `p43${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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
  return { id, token, username };
}

try {
  const page = readFileSync(resolve("src/pages/settings/NotificationSettings.tsx"), "utf8");
  const push = readFileSync(resolve("src/lib/pushRegister.ts"), "utf8");
  const api = readFileSync(resolve("src/features/notifications/deviceTokenApi.ts"), "utf8");
  const session = readFileSync(resolve("src/features/notifications/deviceTokenSession.ts"), "utf8");
  const store = readFileSync(resolve("src/store/useSettingsStore.ts"), "utf8");
  const auth = readFileSync(resolve("src/store/useAuthStore.ts"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");
  const settings = readFileSync(resolve("src/pages/Settings.tsx"), "utf8");
  const alerts = readFileSync(resolve("src/pages/alerts/AlertsPage.tsx"), "utf8");
  const router = readFileSync(resolve("server/modules/push/router.ts"), "utf8");
  const send = readFileSync(resolve("server/modules/push/send.ts"), "utf8");

  assert(app.includes('path="/settings/notifications"'), "one notifications route");
  assert(page.includes("SettingsOptionSheet") && page.includes('title="Notifications"'), "sheet owner");
  assert(page.includes("registerPushToken") && page.includes("unregisterPushToken"), "enable/disable push");
  assert(page.includes("setLiveNotifications") && settings.includes("setLiveNotifications"), "live prefs shared");
  assert(store.includes('name: "settings_v1"') && store.includes("notificationsEnabled"), "local prefs");
  assert(push.includes('platform === "android"') && push.includes('platform === "ios"'), "android+ios");
  assert(api.includes("/api/device-tokens") && !api.includes("userId"), "session-owned tokens");
  assert(session.includes("unregisterCurrentDeviceToken") && auth.includes("unregisterCurrentDeviceToken"), "logout unregisters");
  assert(alerts.includes("Alerts") || alerts.includes("alerts"), "PAGE-032 exists");
  assert(!alerts.includes("device-tokens") && !alerts.includes("registerPushToken"), "alerts ≠ push owner");
  assert(router.includes("ON CONFLICT (user_id, platform)") && router.includes("req.userId"), "upsert + session");
  assert(send.includes("not_configured") && !send.includes("sent: true,"), "honest push send");

  const health = await json("/api/health");
  assert(health.status === 200, `health ${health.status}`);

  assert((await json("/api/device-tokens", { method: "POST", body: "{}" })).status === 401, "unauth POST");
  assert((await json("/api/device-tokens", { method: "DELETE", body: "{}" })).status === 401, "unauth DELETE");
  assert((await json("/api/notifications/device-tokens", { method: "POST", body: "{}" })).status === 404, "no legacy path");

  const accountA = await register("a");
  const accountB = await register("b");
  const tokenA1 = `fcm-a1-${Date.now()}`;
  const tokenA2 = `fcm-a2-${Date.now()}`;
  const tokenIos = `apns-a-${Date.now()}`;

  const empty = await json("/api/device-tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
    body: JSON.stringify({ token: "", platform: "android" }),
  });
  assert(empty.status === 400 || empty.status === 401, `empty token → ${empty.status}`);

  const badPlatform = await json("/api/device-tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
    body: JSON.stringify({ token: tokenA1, platform: "windows" }),
  });
  assert(badPlatform.status === 400, `bad platform → ${badPlatform.status}`);

  const first = await json("/api/device-tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
    body: JSON.stringify({ token: tokenA1, platform: "android", userId: accountB.id }),
  });
  assert(first.status === 200, `POST android → ${first.status}`);
  assert(JSON.stringify(first.body) === JSON.stringify({ ok: true }), "POST body");

  const again = await json("/api/device-tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
    body: JSON.stringify({ token: tokenA1, platform: "android" }),
  });
  assert(again.status === 200, `idempotent POST → ${again.status}`);

  const rotated = await json("/api/device-tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
    body: JSON.stringify({ token: tokenA2, platform: "android" }),
  });
  assert(rotated.status === 200, `token refresh → ${rotated.status}`);

  const ios = await json("/api/device-tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
    body: JSON.stringify({ token: tokenIos, platform: "ios" }),
  });
  assert(ios.status === 200, `POST ios → ${ios.status}`);

  const rows = await getPool()!.query<{ platform: string; token: string }>(
    `SELECT platform, token FROM device_tokens WHERE user_id = $1 ORDER BY platform`,
    [accountA.id],
  );
  assert(rows.rows.length === 2, "two platforms for A");
  assert(rows.rows.find((r) => r.platform === "android")?.token === tokenA2, "android refreshed");
  assert(rows.rows.find((r) => r.platform === "ios")?.token === tokenIos, "ios present");
  assert(!rows.rows.some((r) => r.token === tokenA1), "stale android replaced");

  const countA = await getPool()!.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM device_tokens WHERE user_id = $1`,
    [accountA.id],
  );
  assert(countA.rows[0]?.n === 2, "no duplicate android rows");

  const deleteAndroid = await json("/api/device-tokens", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accountA.token}` },
    body: JSON.stringify({ platform: "android", userId: accountB.id }),
  });
  assert(deleteAndroid.status === 200, `DELETE android → ${deleteAndroid.status}`);
  const afterDelete = await getPool()!.query<{ platform: string }>(
    `SELECT platform FROM device_tokens WHERE user_id = $1`,
    [accountA.id],
  );
  assert(afterDelete.rows.length === 1 && afterDelete.rows[0]?.platform === "ios", "ios kept");

  const otherDelete = await json("/api/device-tokens", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accountB.token}` },
    body: JSON.stringify({ platform: "ios" }),
  });
  assert(otherDelete.status === 200, `B DELETE ios no-op → ${otherDelete.status}`);
  const aStill = await getPool()!.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM device_tokens WHERE user_id = $1`,
    [accountA.id],
  );
  assert(aStill.rows[0]?.n === 1, "B cannot delete A tokens");

  const logoutA = await json("/api/auth/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
  });
  assert(logoutA.status === 200, `logout A → ${logoutA.status}`);
  const afterLogout = await json("/api/device-tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${accountA.token}` },
    body: JSON.stringify({ token: "x", platform: "android" }),
  });
  assert(afterLogout.status === 401, `post-logout token POST → ${afterLogout.status}`);

  await getPool()!.query(`DELETE FROM device_tokens WHERE user_id = $1`, [accountA.id]);

  console.log("PAGE-043 NOTIFICATION SETTINGS RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        localPreferenceOwner: true,
        androidAndIosRegisterPaths: true,
        disableUnregisters: true,
        deviceTokenPostDelete: true,
        upsertIdempotent: true,
        tokenRefreshReplaces: true,
        multiPlatformPerAccount: true,
        crossAccountDeleteBlocked: true,
        forgedUserIdIgnored: true,
        pushConfigured: isPushConfigured(),
        realFcmDelivery: "DEVICE_REQUIRED",
        realApnsDelivery: "NOT_VERIFIED",
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-043 NOTIFICATION SETTINGS RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
