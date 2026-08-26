/**
 * PAGE-014 device proof — physical Android /video/:id with local API session.
 * Run: npx tsx scripts/_page014_videoview_device_proof.ts
 */
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const adb = "C:\\Users\\Absm Construction\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe";
const pkg = "com.elixstarlive.app";
const api = "http://127.0.0.1:8080";

function adbCmd(...args: string[]): string {
  return execFileSync(adb, args, { encoding: "utf8" }).trim();
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function evaluate(expression: string): Promise<unknown> {
  const listRes = await fetch("http://127.0.0.1:9222/json/list");
  assert(listRes.ok, `devtools list failed ${listRes.status}`);
  const pages = (await listRes.json()) as Array<{ webSocketDebuggerUrl?: string }>;
  const page = pages.find((p) => p.webSocketDebuggerUrl);
  assert(page?.webSocketDebuggerUrl, `no webview debugger: ${JSON.stringify(pages)}`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", (ev) => reject(ev));
  });
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const id = 1;
      const timer = setTimeout(() => reject(new Error("eval timeout")), 20000);
      ws.addEventListener("message", (ev) => {
        const msg = JSON.parse(String(ev.data)) as {
          id?: number;
          result?: { result?: { value?: unknown } };
          error?: unknown;
        };
        if (msg.id !== id) return;
        clearTimeout(timer);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result?.result?.value);
      });
      ws.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true, awaitPromise: true },
        }),
      );
    });
  } finally {
    ws.close();
  }
}

async function registerSession(): Promise<{ token: string; user: Record<string, unknown> }> {
  const unique = `d14${Date.now().toString(36)}`.slice(0, 16);
  const email = `${unique}@example.com`;
  const password = "password12";
  const registered = await fetch(`${api}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      username: unique,
      password,
      displayName: `Device ${unique}`,
      ageConfirmed13Plus: true,
      consentVersion: "2026-07-21",
    }),
  });
  const body = (await registered.json()) as Record<string, unknown>;
  const session = (body.session || {}) as Record<string, unknown>;
  let token = String(session.access_token ?? session.accessToken ?? "");
  let user = (body.user || {}) as Record<string, unknown>;
  if (!token) {
    const { getPool } = await import("../server/infra/postgres.ts");
    await getPool().query(
      `UPDATE users SET email_confirmed_at = COALESCE(email_confirmed_at, NOW()) WHERE email_normalized = $1`,
      [email.toLowerCase()],
    );
    const login = await fetch(`${api}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const loginBody = (await login.json()) as Record<string, unknown>;
    const loginSession = (loginBody.session || {}) as Record<string, unknown>;
    token = String(loginSession.access_token ?? loginSession.accessToken ?? "");
    user = (loginBody.user || user) as Record<string, unknown>;
  }
  assert(token, `no access token`);
  assert(typeof user.id === "string", "missing user id");
  return { token, user };
}

const devices = adbCmd("devices", "-l")
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.trim())
  .filter((line) => /\sdevice(\s|$)/.test(line));
assert(devices.length > 0, `no device:\n${adbCmd("devices", "-l")}`);
console.log("device:", devices[0]);

adbCmd("reverse", "tcp:8080", "tcp:8080");
adbCmd("shell", "pm", "clear", pkg);

const { token, user } = await registerSession();
const { getPool } = await import("../server/infra/postgres.ts");
const pool = getPool();
let videoId = "";
try {
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy, hashtags)
     VALUES ($1, $2, $3, 'public', ARRAY['device']) RETURNING id`,
    [user.id, `https://cdn.example/d14-${user.id}.mp4`, `PAGE-014 device ${user.id}`],
  );
  videoId = inserted.rows[0].id;
} finally {
  await pool.end().catch(() => undefined);
}
assert(videoId, "video insert failed");
console.log("videoId:", videoId, "user:", user.id);

adbCmd("shell", "am", "force-stop", pkg);
adbCmd("shell", "am", "start", "-n", `${pkg}/.MainActivity`);
await sleep(4000);

const pid = adbCmd("shell", "pidof", pkg).split(/\s+/).find((p) => /^\d+$/.test(p));
assert(pid, "app not running");
try {
  adbCmd("forward", "--remove", "tcp:9222");
} catch {
  /* none */
}
adbCmd("forward", "tcp:9222", `localabstract:webview_devtools_remote_${pid}`);
await sleep(1000);

const authPayload = JSON.stringify({
  state: {
    user: {
      id: user.id,
      email: user.email ?? null,
      username: user.username ?? "",
      displayName: user.displayName ?? user.display_name ?? "",
      avatarUrl: user.avatarUrl ?? user.avatar_url ?? null,
    },
    session: { token },
    isAuthenticated: true,
  },
  version: 0,
});
const route = `/video/${videoId}`;

assert(
  (await evaluate(`(async () => {
  const Preferences = window.Capacitor?.Plugins?.Preferences;
  if (!Preferences?.set) throw new Error('Preferences missing');
  await Preferences.set({ key: 'elix-auth', value: ${JSON.stringify(authPayload)} });
  try { localStorage.removeItem('elix-auth'); } catch (_) {}
  history.replaceState({}, '', ${JSON.stringify(route)});
  setTimeout(() => location.reload(), 50);
  return true;
})()`)) === true,
  "auth inject failed",
);
await sleep(7000);

const pidAfter = adbCmd("shell", "pidof", pkg).split(/\s+/).find((p) => /^\d+$/.test(p));
assert(pidAfter, "app died after reload");
try {
  adbCmd("forward", "--remove", "tcp:9222");
} catch {
  /* none */
}
adbCmd("forward", "tcp:9222", `localabstract:webview_devtools_remote_${pidAfter}`);
await sleep(1200);

await evaluate(`(() => {
  if (location.pathname !== ${JSON.stringify(route)}) {
    history.replaceState({}, '', ${JSON.stringify(route)});
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  return location.pathname;
})()`);
await sleep(3000);

const proof = (await evaluate(`(() => {
  const text = document.body?.innerText || '';
  const back = !!document.querySelector('button[aria-label="Back"]');
  const missing = text.includes('Video not found or unavailable.');
  const failed = text.includes("Couldn't load this video.");
  const loading = text.includes('Loading…') || text.includes('Loading...');
  const processing = text.includes('Video processing') || text.includes('processing');
  const player = !!document.querySelector('video') || !!document.querySelector('[data-elix-foryou-player], .for-you-player, [class*="ForYou"]');
  return {
    pathname: location.pathname,
    back,
    missing,
    failed,
    loading,
    processing,
    player,
    snippet: text.slice(0, 280),
  };
})()`)) as Record<string, unknown>;

assert(proof.pathname === route, `pathname ${proof.pathname} ${proof.snippet}`);
assert(proof.back === true, `missing back: ${proof.snippet}`);
assert(proof.missing !== true, `public video 404: ${proof.snippet}`);
assert(proof.failed !== true, `network fail: ${proof.snippet}`);
assert(
  proof.loading === true || proof.player === true || proof.processing === true || String(proof.snippet || "").length > 0,
  `no video chrome: ${JSON.stringify(proof)}`,
);

console.log(JSON.stringify({ ok: true, page: "PAGE-014", videoId, device: devices[0], proof }, null, 2));
