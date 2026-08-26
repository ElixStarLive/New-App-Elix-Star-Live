/**
 * PAGE-046 runtime proof — POST /api/report Neon persistence, reporter auth,
 * admin-field ignore, PAGE-072 list sync, video vs user targets.
 * Run: npx tsx scripts/_page046_report_runtime_proof.ts
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
const { reportResponseSchema } = await import("../shared/contracts/social.ts");

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
  const username = `p46${stamp}${Math.random().toString(36).slice(2, 7)}`.slice(0, 12);
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

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

try {
  const page = readFileSync(resolve("src/pages/Report.tsx"), "utf8");
  const modal = readFileSync(resolve("src/components/ReportModal.tsx"), "utf8");
  const api = readFileSync(resolve("src/features/report/reportApi.ts"), "utf8");
  const session = readFileSync(resolve("src/features/report/reportSession.ts"), "utf8");
  const service = readFileSync(resolve("server/modules/reports/service.ts"), "utf8");
  const routers = readFileSync(resolve("server/modules/misc/routers.ts"), "utf8");
  const profile = readFileSync(resolve("src/pages/Profile.tsx"), "utf8");
  const player = readFileSync(resolve("src/components/ForYouPlayer.tsx"), "utf8");
  const liveOverlay = readFileSync(resolve("src/features/live/spectator/ProfileLiveOverlay.tsx"), "utf8");
  const safety = readFileSync(resolve("src/pages/settings/SafetyCenter.tsx"), "utf8");
  const app = readFileSync(resolve("src/App.tsx"), "utf8");

  assert(app.includes('path="/report"'), "route");
  assert(page.includes("SettingsOptionSheet") && page.includes("apiCreateReport"), "page owner");
  assert(modal.includes("createPortal") && modal.includes("apiCreateReport"), "modal owner");
  assert(api.includes("/api/report") && !api.includes("reporter_id"), "canonical api");
  assert(session.includes("submitting") && session.includes("generation"), "double-tap + races");
  assert(routers.includes('moderationRouter.post("/report"') && routers.includes("createReport(req.userId"), "auth reporter");
  assert(service.includes("'open'") && !service.includes("body.status"), "status not client-owned");
  assert(profile.includes("<ReportModal") && player.includes("<ReportModal"), "profile/video handoffs");
  assert(liveOverlay.includes("<Profile") && !liveOverlay.includes("<ReportModal"), "live via Profile");
  assert(safety.includes("/report?type=support&id=support_ticket"), "safety handoff");
  assert(!page.includes("setTimeout") && !modal.includes("setTimeout"), "no timer close patch");

  assert((await json("/api/health")).status === 200, "health");
  assert((await json("/api/report", { method: "POST", body: "{}" })).status === 401, "unauth");
  assert((await json("/api/reports", { method: "POST", body: "{}" })).status === 404, "no duplicate path");

  const reporter = await register("a");
  const target = await register("b");
  const other = await register("c");

  const retired = await json("/api/report", {
    method: "POST",
    headers: auth(reporter.token),
    body: JSON.stringify({ targetKind: "user", targetId: target.id, reason: "spam" }),
  });
  assert(retired.status === 400, `retired body → ${retired.status}`);

  const forged = await json("/api/report", {
    method: "POST",
    headers: auth(reporter.token),
    body: JSON.stringify({
      targetType: "user",
      targetId: target.id,
      reason: "spam",
      details: "profile report proof",
      reporter_id: other.id,
      status: "resolved",
      adminNote: "injected",
      reviewedBy: other.id,
    }),
  });
  assert(forged.status === 200, `forged → ${forged.status}`);
  assert(reportResponseSchema.safeParse(forged.body).success, "response schema");
  const reportId = String((forged.body as { id?: string }).id ?? "");
  assert(Boolean(reportId), "report id");

  const stored = await getPool()!.query<{
    reporter_id: string;
    target_kind: string;
    target_id: string;
    reason: string;
    details: string;
    status: string;
  }>(
    `SELECT reporter_id::text AS reporter_id, target_kind, target_id, reason, details, status
     FROM reports WHERE id = $1`,
    [reportId],
  );
  assert(stored.rows[0]?.reporter_id === reporter.id, "reporter from session");
  assert(stored.rows[0]?.target_kind === "user", "user target kind");
  assert(stored.rows[0]?.target_id === target.id, "target id");
  assert(stored.rows[0]?.reason === "spam", "reason");
  assert(stored.rows[0]?.details === "profile report proof", "details");
  assert(stored.rows[0]?.status === "open", "status open not injected");

  const video = await getPool()!.query<{ id: string }>(
    `INSERT INTO videos (user_id, bunny_path, caption, privacy)
     VALUES ($1, 'https://cdn.example/p46-proof.mp4', 'clip', 'public')
     RETURNING id::text AS id`,
    [target.id],
  );
  const videoId = video.rows[0].id;
  const videoReport = await json("/api/report", {
    method: "POST",
    headers: auth(reporter.token),
    body: JSON.stringify({
      targetType: "video",
      targetId: videoId,
      reason: "nudity",
      details: "video report proof",
    }),
  });
  assert(videoReport.status === 200, `video report → ${videoReport.status}`);
  const videoReportId = String((videoReport.body as { id?: string }).id ?? "");
  const videoRow = await getPool()!.query<{ target_id: string; target_kind: string }>(
    `SELECT target_id, target_kind FROM reports WHERE id = $1`,
    [videoReportId],
  );
  assert(videoRow.rows[0]?.target_id === videoId, "videoId not creatorId");
  assert(videoRow.rows[0]?.target_kind === "video", "video kind");

  const support = await json("/api/report", {
    method: "POST",
    headers: auth(reporter.token),
    body: JSON.stringify({
      targetType: "support",
      targetId: "support_ticket",
      reason: "other",
      details: "",
    }),
  });
  assert(support.status === 200, `support → ${support.status}`);

  const invalidType = await json("/api/report", {
    method: "POST",
    headers: auth(reporter.token),
    body: JSON.stringify({ targetType: "story", targetId: "x", reason: "spam" }),
  });
  assert(invalidType.status === 400, `invalid type → ${invalidType.status}`);

  const missingTarget = await json("/api/report", {
    method: "POST",
    headers: auth(reporter.token),
    body: JSON.stringify({ targetType: "user", targetId: "", reason: "spam" }),
  });
  assert(missingTarget.status === 400, `empty target → ${missingTarget.status}`);

  await getPool()!.query(`UPDATE users SET is_admin = true WHERE id = $1`, [other.id]);
  const adminList = await json("/api/admin/reports?status=pending", { headers: auth(other.token) });
  assert(adminList.status === 200, `admin list → ${adminList.status}`);
  const reports = ((adminList.body as { reports?: Array<Record<string, unknown>> }).reports ?? []) as Array<
    Record<string, unknown>
  >;
  const userRow = reports.find((row) => row.id === reportId);
  assert(Boolean(userRow), "PAGE-072 sees profile report");
  assert(userRow?.reporterId === reporter.id, "admin reporterId");
  assert(userRow?.targetType === "user", "admin targetType");
  assert(userRow?.targetId === target.id, "admin targetId");
  assert(userRow?.reason === "spam", "admin reason");
  assert(userRow?.details === "profile report proof", "admin details");
  assert(userRow?.status === "open", "admin status open");

  const videoAdmin = reports.find((row) => row.id === videoReportId);
  assert(Boolean(videoAdmin), "PAGE-072 sees video report");
  assert(videoAdmin?.targetId === videoId, "admin video target");

  const privacy = await json("/api/admin/reports?status=pending", { headers: auth(reporter.token) });
  assert(privacy.status === 403, `non-admin list → ${privacy.status}`);

  const logout = await json("/api/auth/logout", { method: "POST", headers: auth(reporter.token) });
  assert(logout.status === 200, `logout → ${logout.status}`);
  assert(
    (await json("/api/report", {
      method: "POST",
      headers: auth(reporter.token),
      body: JSON.stringify({ targetType: "support", targetId: "support_ticket", reason: "other" }),
    })).status === 401,
    "post-logout report 401",
  );

  await getPool()!.query(`DELETE FROM reports WHERE id = ANY($1::uuid[])`, [[reportId, videoReportId]]);
  await getPool()!.query(`UPDATE users SET is_admin = false WHERE id = $1`, [other.id]);

  console.log("PAGE-046 REPORT RUNTIME PROOF: PASS");
  console.log(
    JSON.stringify(
      {
        neonPersisted: true,
        reporterFromSession: true,
        adminStatusIgnored: true,
        videoTargetIsVideoId: true,
        page072Sync: true,
        reportPrivacy: true,
      },
      null,
      2,
    ),
  );
  process.exit(0);
} catch (error) {
  console.error("PAGE-046 REPORT RUNTIME PROOF: FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
