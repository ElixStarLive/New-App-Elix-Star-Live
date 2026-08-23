import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const page = readFileSync(resolve(process.cwd(), "src/pages/Inbox.tsx"), "utf8");
const overlay = readFileSync(resolve(process.cwd(), "src/features/inbox/InboxActivityOverlay.tsx"), "utf8");
const line = readFileSync(resolve(process.cwd(), "src/features/inbox/inboxActivityLine.ts"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/inbox/inboxSession.ts"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/inbox/inboxApi.ts"), "utf8");
const query = readFileSync(resolve(process.cwd(), "server/modules/inbox/query.ts"), "utf8");

describe("PAGE-031 Inbox Activity overlay ownership", () => {
  it("owns the Inbox overlay only, using the existing activity contract", () => {
    expect(app).not.toMatch(/path="\/activity"/);
    expect(page).toMatch(/InboxActivityOverlay/);
    expect(page).toMatch(/requestActivityOverlay/);
    expect(page).toMatch(/\/video\/\$\{encodeURIComponent\(videoId\)\}/);
    expect(page).toMatch(/inboxReturnState/);
    expect(page).not.toMatch(/No activity yet\. When someone likes/);
    expect(overlay).toMatch(/Close activity/);
    expect(overlay).toMatch(/No activity yet\. When someone likes, comments on, saves your video, or @mentions you, it will show here\./);
    expect(overlay).toMatch(/inboxActivityLine/);
    expect(overlay).not.toMatch(/new WebSocket|setTimeout|location\.reload|apiListInboxActivity|\/api\/notifications|AlertsPage|InboxActivityOverlayV2|Fixed|username: 'user'/);
    expect(line).toMatch(/Liked your video/);
    expect(session).toMatch(/activityOverlayRequested/);
    expect(session).toMatch(/apiListInboxActivity/);
    expect(api).toMatch(/\/api\/activity/);
    expect(query).toMatch(/listInboxActivity/);
  });

  it("does not add a second activity fetch or a second WebSocket", () => {
    const overlayFetches = overlay.match(/apiRequest|apiListInboxActivity|fetch\(/g) || [];
    expect(overlayFetches).toEqual([]);
    expect(overlay).not.toMatch(/wsClient/);
    expect(session.split("apiListInboxActivity").length).toBe(3);
  });
});
