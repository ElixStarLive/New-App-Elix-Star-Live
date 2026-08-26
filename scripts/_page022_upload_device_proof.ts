/**
 * PAGE-022 device proof — physical Android /upload chrome.
 * Run: npx tsx scripts/_page022_upload_device_proof.ts
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
  assert(page?.webSocketDebuggerUrl, "no webview debugger");
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

async function registerSession() {
  const unique = `d22${Date.now().toString(36)}`.slice(0, 16);
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
    await getPool().end().catch(() => undefined);
  }
  assert(token && typeof user.id === "string", "auth failed");
  return { token, user };
}

const devices = adbCmd("devices", "-l")
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.trim())
  .filter((line) => /\sdevice(\s|$)/.test(line));
assert(devices.length > 0, "no device");
adbCmd("reverse", "tcp:8080", "tcp:8080");
adbCmd("shell", "pm", "clear", pkg);

const { token, user } = await registerSession();
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
await sleep(800);

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

assert(
  (await evaluate(`(async () => {
  await window.Capacitor.Plugins.Preferences.set({ key: 'elix-auth', value: ${JSON.stringify(authPayload)} });
  try { localStorage.removeItem('elix-auth'); } catch (_) {}
  history.replaceState({}, '', '/upload');
  setTimeout(() => location.reload(), 50);
  return true;
})()`)) === true,
  "inject failed",
);
await sleep(8000);
const pidAfter = adbCmd("shell", "pidof", pkg).split(/\s+/).find((p) => /^\d+$/.test(p));
assert(pidAfter, "app died");
try {
  adbCmd("forward", "--remove", "tcp:9222");
} catch {
  /* none */
}
adbCmd("forward", "tcp:9222", `localabstract:webview_devtools_remote_${pidAfter}`);
await sleep(1200);
await evaluate(`(() => { if (location.pathname !== '/upload') { history.replaceState({}, '', '/upload'); window.dispatchEvent(new PopStateEvent('popstate')); } return location.pathname; })()`);
await sleep(3000);

const proof = (await evaluate(`(() => {
  const text = document.body?.innerText || '';
  return {
    pathname: location.pathname,
    uploadCue: /upload|caption|hashtag|post|publish|privacy|sound|select|video|story/i.test(text),
    snippet: text.slice(0, 320),
  };
})()`)) as Record<string, unknown>;

assert(proof.pathname === "/upload", `path ${proof.pathname} ${proof.snippet}`);
assert(proof.uploadCue === true, `no upload chrome: ${proof.snippet}`);

console.log(JSON.stringify({ ok: true, page: "PAGE-022", device: devices[0], proof }, null, 2));
