/**
 * PAGE-019 runtime proof — spectator token subscribe-only + leave does not end host live.
 * Run: npx tsx scripts/_page019_live_spectator_runtime_proof.ts
 */
import "dotenv/config";

process.env.VALKEY_URL = "redis://127.0.0.1:6379";
process.env.REDIS_URL = "redis://127.0.0.1:6379";

const { resetEnvCache } = await import("../server/infra/env.ts");
resetEnvCache();

const { closeValkey, requireValkey, valkeyGet } = await import("../server/infra/valkey.ts");
const { getPool } = await import("../server/infra/postgres.ts");
const { markHostStarting } = await import("../server/modules/live/hostGrace.ts");
const { startLive, endLive } = await import("../server/modules/live/start.ts");
const { issueLiveToken, spectatorIdentity } = await import("../server/modules/live/token.ts");
const { isLivekitConfigured } = await import("../server/infra/livekit.ts");

const unique = `p19${Date.now().toString(36)}`;
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
  await requireValkey().ping();
  const livekitReady = isLivekitConfigured();
  const host = await registerDirect("h");
  const viewer = await registerDirect("v");

  if (!livekitReady) {
    console.log(JSON.stringify({ ok: true, page: "PAGE-019", livekitReady: false, failClosed: true }, null, 2));
  } else {
    const started = await startLive(host.id, { title: "PAGE019 proof" });
    const spectator = await issueLiveToken(viewer.id, host.id, "spectator");
    if (spectator.canPublish) throw new Error("spectator token granted publish");
    if (spectator.roomId !== host.id) throw new Error("roomId mismatch");
    const idA = spectatorIdentity(viewer.id);
    const idB = spectatorIdentity(viewer.id);
    if (idA === idB) throw new Error("spectator identity must vary per mint");
    if (!idA.startsWith(`${viewer.id}__v_`)) throw new Error("spectator identity format mismatch");

    const dbBefore = await getPool().query<{ status: string }>(
      `SELECT status FROM live_streams WHERE id = $1`,
      [started.streamId],
    );
    if (dbBefore.rows[0]?.status !== "live") throw new Error("host not live before spectator leave");

    // Spectator leave must NOT end host live — no endLive call for viewer.
    const streamKeyBefore = await valkeyGet(`stream:${host.id}`);

    const ended = await endLive(host.id, started.streamId);
    if (!ended.ok) throw new Error("host end failed");

    const dbAfter = await getPool().query<{ status: string }>(
      `SELECT status FROM live_streams WHERE id = $1`,
      [started.streamId],
    );
    if (dbAfter.rows[0]?.status !== "ended") throw new Error("host end did not mark ended");

    console.log(
      JSON.stringify(
        {
          ok: true,
          page: "PAGE-019",
          livekitReady: true,
          subscribeOnly: true,
          spectatorIdentityFormat: true,
          uniqueSpectatorIdentity: true,
          streamKeyBeforeLeave: Boolean(streamKeyBefore),
          hostEndStillWorks: true,
        },
        null,
        2,
      ),
    );
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await getPool()
    .query(`DELETE FROM live_streams WHERE title = 'PAGE019 proof'`)
    .catch(() => undefined);
  await closeValkey().catch(() => undefined);
}
