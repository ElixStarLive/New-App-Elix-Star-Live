/**
 * PAGE-012 device proof — physical Android Search route with local API session.
 * Requires: adb device, installDebug build with VITE_API_URL=http://127.0.0.1:8080,
 *           adb reverse tcp:8080, API on :8080.
 * Run: npx tsx scripts/_page012_search_device_proof.ts
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
  const unique = `d12${Date.now().toString(36)}`.slice(0, 16);
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
  assert(token, `no access token from register/login: ${JSON.stringify(body)}`);
  assert(typeof user.id === "string", "missing user id");
  return { token, user };
}

const devices = adbCmd("devices", "-l")
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.trim())
  .filter((line) => /\sdevice(\s|$)/.test(line));
assert(devices.length > 0, `no physical device online:\n${adbCmd("devices", "-l")}`);
console.log("device:", devices[0]);

adbCmd("reverse", "tcp:8080", "tcp:8080");
adbCmd("shell", "pm", "clear", pkg);
const { token, user } = await registerSession();
console.log("session user:", user.id);

adbCmd("shell", "am", "force-stop", pkg);
adbCmd("shell", "am", "start", "-n", `${pkg}/.MainActivity`);
await sleep(4000);

const pidLine = adbCmd("shell", "pidof", pkg);
const pid = pidLine.split(/\s+/).find((p) => /^\d+$/.test(p));
assert(pid, `app not running after launch (pidof=${pidLine})`);
console.log("pid:", pid);

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

const inject = await evaluate(`(async () => {
  const payload = ${JSON.stringify(authPayload)};
  const Preferences = window.Capacitor?.Plugins?.Preferences;
  if (!Preferences?.set) throw new Error('Preferences plugin missing');
  await Preferences.set({ key: 'elix-auth', value: payload });
  try { localStorage.removeItem('elix-auth'); } catch (_) {}
  history.replaceState({}, '', '/search');
  setTimeout(() => location.reload(), 50);
  return true;
})()`);
assert(inject === true, "auth inject failed");
await sleep(7000);

const pidAfter = adbCmd("shell", "pidof", pkg).split(/\s+/).find((p) => /^\d+$/.test(p));
assert(pidAfter, "app not running after reload");
try {
  adbCmd("forward", "--remove", "tcp:9222");
} catch {
  /* none */
}
adbCmd("forward", "tcp:9222", `localabstract:webview_devtools_remote_${pidAfter}`);
await sleep(1200);

await evaluate(`(() => {
  if (location.pathname !== '/search') {
    history.replaceState({}, '', '/search');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  return location.pathname;
})()`);
await sleep(2000);

const proof = (await evaluate(`(() => {
  const text = document.body?.innerText || '';
  const input = document.querySelector('input[aria-label="Search"]');
  const title = [...document.querySelectorAll('h1')].some((n) => (n.textContent || '').trim() === 'Search');
  const allChip = text.includes('All') && text.includes('For You') && text.includes('Dance');
  return {
    pathname: location.pathname,
    hasInput: !!input,
    title,
    allChip,
    host: !!document.querySelector('.app-live-column-host'),
    snippet: text.slice(0, 200),
  };
})()`)) as {
  pathname?: string;
  hasInput?: boolean;
  title?: boolean;
  allChip?: boolean;
  host?: boolean;
  snippet?: string;
};

assert(proof.pathname === "/search", `pathname ${proof.pathname} snippet=${proof.snippet}`);
assert(proof.hasInput, "missing Search input");
assert(proof.title, "missing Search title");
assert(proof.allChip, `missing browse chips: ${proof.snippet}`);
assert(proof.host, "missing app-live-column-host");

console.log(JSON.stringify({ ok: true, page: "PAGE-012", device: devices[0], proof }, null, 2));
