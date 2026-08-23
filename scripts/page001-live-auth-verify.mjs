/**
 * PAGE-001 live production auth verification.
 * Uses PAGE001_EMAIL / PAGE001_PASSWORD when set.
 * Does not print passwords, tokens, or cookies.
 */
const ORIGIN = process.env.PAGE001_ORIGIN || "https://www.elixstarlive.co.uk";
const email = process.env.PAGE001_EMAIL || "";
const password = process.env.PAGE001_PASSWORD || "";

function cookieHeader(setCookie) {
  if (!setCookie?.length) return "";
  return setCookie
    .map((line) => line.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

function hasAuthCookie(setCookie) {
  return Boolean(setCookie?.some((line) => /^auth_token=/i.test(line)));
}

function isProductionShape(body) {
  if (!body || typeof body !== "object") return false;
  const user = body.user;
  const session = body.session;
  const meta = body.profile_meta;
  return Boolean(
    user &&
      typeof user.id === "string" &&
      typeof user.email === "string" &&
      user.user_metadata &&
      typeof user.user_metadata.username === "string" &&
      session &&
      typeof session.access_token === "string" &&
      session.access_token.length > 0 &&
      meta &&
      typeof meta.is_admin === "boolean" &&
      typeof meta.is_creator === "boolean",
  );
}

async function postJson(path, body, headers = {}) {
  const res = await fetch(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    status: res.status,
    json,
    setCookie: typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : undefined,
  };
}

async function getJson(path, headers = {}) {
  const res = await fetch(`${ORIGIN}${path}`, { headers });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

const results = {};

try {
  if (!email || !password) {
    throw new Error("Set PAGE001_EMAIL and PAGE001_PASSWORD for successful live login proof.");
  }

  const invalid = await postJson("/api/auth/login", {
    email: "page001-parity-probe@example.com",
    password: "definitely-wrong-password-xx",
  });
  results.invalid_login =
    invalid.status === 401 && String(invalid.json?.error || "") === "Invalid login credentials."
      ? "PASS"
      : `FAIL status=${invalid.status}`;

  const login = await postJson("/api/auth/login", { email, password });
  results.successful_live_login =
    login.status === 200 && isProductionShape(login.json) ? "PASS" : `FAIL status=${login.status}`;
  results.production_cookie = hasAuthCookie(login.setCookie) ? "PASS" : "FAIL_NO_SET_COOKIE";
  results.login_shape = isProductionShape(login.json) ? "PASS" : "FAIL";

  const token = String(login.json?.session?.access_token || "");
  const cookie = cookieHeader(login.setCookie);

  const meCookie = await getJson("/api/auth/me", cookie ? { Cookie: cookie } : {});
  results.me_cookie =
    meCookie.status === 200 && isProductionShape(meCookie.json)
      ? "PASS"
      : `FAIL status=${meCookie.status} shape=${isProductionShape(meCookie.json)}`;

  const meBearer = await getJson("/api/auth/me", { Authorization: `Bearer ${token}` });
  results.me_bearer =
    meBearer.status === 200 && isProductionShape(meBearer.json)
      ? "PASS"
      : `FAIL status=${meBearer.status} shape=${isProductionShape(meBearer.json)}`;

  const meAgain = await getJson("/api/auth/me", { Authorization: `Bearer ${token}` });
  results.session_reload_proxy =
    meAgain.status === 200 && isProductionShape(meAgain.json) ? "PASS" : "FAIL";

  const logout = await postJson(
    "/api/auth/logout",
    {},
    {
      Authorization: `Bearer ${token}`,
      ...(cookie ? { Cookie: cookie } : {}),
    },
  );
  results.logout = logout.status === 200 ? "PASS" : `FAIL status=${logout.status}`;

  const meAfter = await getJson("/api/auth/me", { Authorization: `Bearer ${token}` });
  results.after_logout_me = meAfter.status === 401 ? "PASS" : `FAIL status=${meAfter.status}`;

  const ok = Object.values(results).every((v) => v === "PASS");
  console.log(JSON.stringify({ ok, origin: ORIGIN, results }, null, 2));
  process.exit(ok ? 0 : 1);
} catch (err) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        origin: ORIGIN,
        results,
        error: err instanceof Error ? err.message : String(err),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
