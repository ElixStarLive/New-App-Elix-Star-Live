import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const page = readFileSync(resolve(process.cwd(), "src/pages/alerts/AlertsPage.tsx"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/alerts/alertsSession.ts"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/alerts/alertsApi.ts"), "utf8");
const query = readFileSync(resolve(process.cwd(), "server/modules/notifications/query.ts"), "utf8");
const liveStarted = readFileSync(resolve(process.cwd(), "server/modules/notifications/liveStarted.ts"), "utf8");
const startLive = readFileSync(resolve(process.cwd(), "server/modules/live/start.ts"), "utf8");
const notify = readFileSync(resolve(process.cwd(), "server/modules/misc/routers.ts"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");

describe("PAGE-032 Alerts ownership", () => {
  it("owns /alerts with one session and GET /api/notifications", () => {
    expect(app).toMatch(/path="\/alerts" element=\{<AlertsPage \/>\}/);
    expect(app.match(/path="\/alerts"/g)?.length).toBe(1);
    expect(page).toMatch(/createAlertsSession/);
    expect(page).toMatch(/Back to inbox/);
    expect(page).toMatch(/RoyceBackIcon/);
    expect(page).toMatch(/No alerts yet\./);
    expect(page).toMatch(/inboxReturnState/);
    expect(page).toMatch(/apiLiveStatus/);
    expect(page).toMatch(/This live has ended/);
    expect(page).toMatch(/wsClient\.on\("stream_ended"/);
    expect(page).not.toMatch(/new WebSocket|AlertsOld|AlertsNew|AlertsV2|AlertsFixed|location\.reload|apiListInboxNotices|<X |from "lucide-react".*X/);
    expect(session).toMatch(/apiListAlerts/);
    expect(session).toMatch(/apiMarkAlertsRead/);
    expect(session).not.toMatch(/setTimeout|location\.reload|localStorage/);
    expect(api).toMatch(/\/api\/notifications"/);
    expect(api).toMatch(/\/api\/notifications\/read/);
    expect(query).toMatch(/listAlerts/);
    expect(query).toMatch(/kind IN \('system', 'live_started'\)/);
    expect(query).toMatch(/n\.payload->>'roomId'/);
    expect(query).toMatch(/n\.payload->>'hostUserId'/);
    expect(query).not.toMatch(/payload->>'streamKey'|payload->>'hostId'|payload->>'host_user_id'/);
    expect(page).not.toMatch(/data\.hostId/);
    expect(liveStarted).toMatch(/notifyFollowersLiveStarted/);
    expect(liveStarted).toMatch(/deleteLiveStartedNotificationsForRoom/);
    expect(liveStarted).toMatch(/kind = 'live_started'/);
    expect(startLive).toMatch(/notifyFollowersLiveStarted/);
    expect(startLive).toMatch(/deleteLiveStartedNotificationsForRoom/);
    expect(notify).toMatch(/listAlerts/);
    expect(nav).toMatch(/path === "\/alerts"\) return INBOX_HOME/);
  });

  it("does not own push registration or chat threads", () => {
    expect(page).not.toMatch(/device-tokens|ChatThread|\/inbox\/:/);
    expect(api).not.toMatch(/device-tokens/);
  });
});
