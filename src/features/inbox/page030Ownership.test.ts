import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const page = readFileSync(resolve(process.cwd(), "src/pages/Inbox.tsx"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/inbox/inboxSession.ts"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/inbox/inboxApi.ts"), "utf8");
const chatApi = readFileSync(resolve(process.cwd(), "src/features/chat/chatApi.ts"), "utf8");
const query = readFileSync(resolve(process.cwd(), "server/modules/inbox/query.ts"), "utf8");
const miscRouters = readFileSync(resolve(process.cwd(), "server/modules/misc/routers.ts"), "utf8");
const serverIndex = readFileSync(resolve(process.cwd(), "server/index.ts"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");

describe("PAGE-030 Inbox ownership", () => {
  it("owns /inbox with one session and the NEW inbox/activity contracts", () => {
    expect(app).toMatch(/path="\/inbox" element=\{<Inbox \/>\}/);
    expect(page).toMatch(/createInboxSession/);
    expect(page).toMatch(/New followers/);
    expect(page).toMatch(/Gift received/);
    expect(page).toMatch(/You’re all caught up/);
    expect(page).toMatch(/inboxReturnState/);
    expect(page).toMatch(/wsClient\.on\("dm_thread_updated"/);
    expect(page).not.toMatch(/wsClient\.on\("dm_message"/);
    expect(page).not.toMatch(/new WebSocket|InboxOld|InboxNew|InboxV2|location\.reload|elix_inbox_deleted/);
    expect(session).toMatch(/apiListChatThreads/);
    expect(session).toMatch(/apiListInboxActivity/);
    expect(session).toMatch(/apiDeleteChatThread/);
    expect(session).not.toMatch(/setTimeout|location\.reload/);
    expect(api).toMatch(/\/api\/activity/);
    expect(api).toMatch(/\/api\/inbox\/live-share-requests/);
    expect(api).toMatch(/\/api\/live-share/);
    expect(api).toMatch(/apiLiveShareCreate/);
    expect(api).toMatch(/\/api\/inbox\/notices/);
    expect(chatApi).toMatch(/\/api\/inbox\/threads/);
    expect(chatApi).not.toMatch(/\/api\/activity/);
    expect(query).toMatch(/listInboxActivity/);
    expect(query).toMatch(/video_likes/);
    expect(query).toMatch(/live_share_inbox/);
    expect(query).toMatch(/bucket <> 'test'/);
    expect(miscRouters).not.toMatch(/chatRouter\.get\("\/threads"/);
    expect(serverIndex).not.toMatch(/\/api\/chat/);
  });

  it("hands Activity overlay open/close to PAGE-031 without owning overlay rows", () => {
    expect(page).not.toMatch(/No activity yet\. When someone likes/);
    expect(page).toMatch(/InboxActivityOverlay/);
    expect(page).toMatch(/requestActivityOverlay/);
    expect(session).toMatch(/activityOverlayRequested/);
  });

  it("keeps Inbox hub close as a named For You exit", () => {
    expect(nav).toMatch(/INBOX_HOME = "\/inbox"/);
    expect(page).toMatch(/FEED_HOME/);
    expect(page).toMatch(/Close inbox and go to For You/);
  });
});
