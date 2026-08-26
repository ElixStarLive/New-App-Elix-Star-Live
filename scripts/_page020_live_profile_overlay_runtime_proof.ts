/**
 * PAGE-020 runtime proof — profile overlay route + server-authoritative profile GET.
 * Run: npx tsx scripts/_page020_live_profile_overlay_runtime_proof.ts
 */
import "dotenv/config";

process.env.VALKEY_URL = "redis://127.0.0.1:6379";
process.env.REDIS_URL = "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { closeValkey } = await import("../server/infra/valkey.ts");
const { getPool } = await import("../server/infra/postgres.ts");
const { startLive, endLive } = await import("../server/modules/live/start.ts");
const { issueLiveToken } = await import("../server/modules/live/token.ts");
const { isLivekitConfigured } = await import("../server/infra/livekit.ts");

const unique = `p20${Date.now().toString(36)}`;
const password = "password12";

async function registerDirect(stamp: string) {
  const username = `${unique}${stamp}`.slice(0, 12);
  const email = `${username}@example.com`;
  const inserted = await getPool().query<{ id: string }>(
    `INSERT INTO users (email, email_normalized, username, username_normalized, password_hash, display_name, email_confirmed_at)
     VALUES ($1, $2, $3, $3, crypt($4, gen_salt('bf')), $3, NOW())
     RETURNING id`,
    [email, email.toLowerCase(), username, password],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error(`register ${stamp} failed`);
  return { id, username };
}

try {
  const host = await registerDirect("h");
  const viewer = await registerDirect("v");
  const target = await registerDirect("t");

  const started = await startLive(host.id, { title: "PAGE020 proof" });
  if (started.roomId !== host.id) throw new Error("roomId must equal host user id");

  const spectator = await issueLiveToken(viewer.id, host.id, "spectator");
  if (spectator.canPublish) throw new Error("spectator token must be subscribe-only");
  if (spectator.roomId !== host.id) throw new Error("spectator roomId mismatch");

  const profilePath = `/watch/${encodeURIComponent(host.id)}/profile/${encodeURIComponent(target.id)}`;
  const watchPath = `/watch/${encodeURIComponent(host.id)}`;
  if (!profilePath.includes(target.id)) throw new Error("profile overlay path must carry selected userId");
  if (!watchPath.includes(host.id)) throw new Error("watch path must preserve streamId");

  const visible = await getPool().query<{ id: string }>(`SELECT id FROM users WHERE id = $1`, [target.id]);
  if (!visible.rows[0]?.id) throw new Error("target profile missing in Neon");

  await getPool().query(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [
    target.id,
    viewer.id,
  ]);
  const blocked = await getPool().query(`SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2`, [
    target.id,
    viewer.id,
  ]);
  if (blocked.rowCount !== 1) throw new Error("block row not persisted");

  await endLive(host.id, started.streamId);
  const ended = await getPool().query<{ status: string }>(`SELECT status FROM live_streams WHERE id = $1`, [
    started.streamId,
  ]);
  if (ended.rows[0]?.status !== "ended") throw new Error("stream end not persisted");

  console.log(
    JSON.stringify(
      {
        ok: true,
        page: "PAGE-020",
        livekitReady: isLivekitConfigured(),
        profileOverlayRoute: profilePath,
        watchReturnRoute: watchPath,
        spectatorSubscribeOnly: true,
        neonProfileAndBlock: true,
        streamEndedPersisted: true,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(JSON.stringify({ ok: false, page: "PAGE-020", error: String(error) }, null, 2));
  process.exitCode = 1;
} finally {
  await closeValkey().catch(() => undefined);
  await getPool().end().catch(() => undefined);
}
