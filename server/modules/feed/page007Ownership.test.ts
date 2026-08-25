import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const lifecycle = readFileSync(resolve(process.cwd(), "server/modules/feed/foryouLifecycle.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/feed/router.ts"), "utf8");
const query = readFileSync(resolve(process.cwd(), "server/modules/feed/query.ts"), "utf8");
const session = readFileSync(resolve(process.cwd(), "server/modules/uploads/session.ts"), "utf8");
const jobs = readFileSync(resolve(process.cwd(), "server/infra/jobs.ts"), "utf8");
const migration = readFileSync(
  resolve(process.cwd(), "server/migrations/20260823120000_foryou_lifecycle_page007.sql"),
  "utf8",
);

describe("PAGE-007 For You ownership", () => {
  it("dedupes track-view via video_views and bumps views only when counted", () => {
    expect(router).toMatch(/INSERT INTO video_views \(video_id, viewer_id\)/);
    expect(router).toMatch(/ON CONFLICT \(video_id, viewer_id\) DO NOTHING/);
    expect(router).toMatch(/UPDATE videos SET views = COALESCE\(views, 0\) \+ 1/);
    expect(router).not.toMatch(/UPDATE videos SET views = COALESCE\(views, 0\) \+ 1 WHERE id = \$1 RETURNING id AS video_id/);
  });

  it("bumps shares only on track-interaction share", () => {
    expect(router).toMatch(/type === "share"/);
    expect(router).toMatch(/UPDATE videos SET shares = COALESCE\(shares, 0\) \+ 1/);
  });

  it("keeps story clips and empty media out of For You snap pages", () => {
    const start = query.indexOf("export async function queryForYouPage");
    const end = query.indexOf("export async function queryStemRanked");
    const body = query.slice(start, end === -1 ? undefined : end);
    expect(body).toMatch(/bunny_path NOT ILIKE '%\/stories\/%'/);
    expect(body).toMatch(/btrim\(COALESCE\(v\.bunny_path, ''\)\) <> ''/);
  });

  it("enrolls published videos and sweeps lifecycle", () => {
    expect(lifecycle).toMatch(/export async function enrollVideoInForYou/);
    expect(lifecycle).toMatch(/export async function onQualifiedUniqueViewForFeed/);
    expect(lifecycle).toMatch(/export async function sweepForYouLifecycle/);
    expect(session).toMatch(/enrollVideoInForYou/);
    expect(jobs).toMatch(/sweepForYouLifecycle/);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS video_foryou_state/);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS foryou_config/);
    expect(lifecycle).toMatch(/FROM foryou_config/);
    expect(lifecycle).toMatch(/video_foryou_state/);
    expect(lifecycle).not.toMatch(/elix_foryou_config|elix_video_foryou_state/);
  });
});
