import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const page = readFileSync(resolve(process.cwd(), "src/pages/ChatThread.tsx"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/chat/chatThreadSession.ts"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/chat/chatApi.ts"), "utf8");
const query = readFileSync(resolve(process.cwd(), "server/modules/inbox/thread.ts"), "utf8");
const routes = readFileSync(resolve(process.cwd(), "server/modules/app/clientRoutes.ts"), "utf8");
const ws = readFileSync(resolve(process.cwd(), "server/websocket/index.ts"), "utf8");
const clientWs = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "src/lib/settingsNav.ts"), "utf8");

describe("PAGE-033 Chat Thread ownership", () => {
  it("owns /inbox/:threadId with one session and inbox message contracts", () => {
    expect(app.match(/path="\/inbox\/:threadId"/g)?.length).toBe(1);
    expect(app).toMatch(/path="\/inbox\/:threadId" element=\{<ChatThread \/>\}/);
    expect(page).toMatch(/createChatThreadSession/);
    expect(page).toMatch(/RoyceBackIcon/);
    expect(page).toMatch(/Type a message/);
    expect(page).toMatch(/circleSize=\{30\}/);
    expect(page).toMatch(/size=\{48\}/);
    expect(page).toMatch(/inboxReturnState/);
    expect(page).toMatch(/wsClient\.on\("dm_message"/);
    expect(page).toMatch(/wsClient\.on\("connected"/);
    expect(page).not.toMatch(/new WebSocket|ChatThreadOld|ChatThreadNew|ChatThreadV2|ChatThreadFixed|location\.reload|threadId \|\||userId \|\||setTimeout/);
    expect(session).toMatch(/apiGetChatThread/);
    expect(session).toMatch(/apiFetchThreadMessages/);
    expect(session).toMatch(/apiSendThreadMessage/);
    expect(session).toMatch(/apiMarkThreadRead/);
    expect(session).not.toMatch(/setTimeout|location\.reload|threadId \|\||userId \|\|/);
    expect(api).toMatch(/\/api\/inbox\/threads\/\$\{encodeURIComponent\(threadId\)\}`/);
    expect(api).toMatch(/\/messages/);
    expect(api).toMatch(/\/read/);
    expect(query).toMatch(/listThreadMessages/);
    expect(query).toMatch(/sendThreadMessage/);
    expect(query).toMatch(/markThreadRead/);
    expect(query).toMatch(/client_request_id/);
    expect(query).toMatch(/FROM chat_messages/);
    expect(query).not.toMatch(/new Map\(|module\.exports|globalThis/);
    expect(routes).toMatch(/sendToUserGlobal/);
    expect(routes).toMatch(/dmRealtimePayloads/);
    expect(ws).toMatch(/export async function sendToUserGlobal/);
    expect(ws).toMatch(/user:events/);
    expect(clientWs).toMatch(/export const wsClient = new WsClient/);
    expect(nav).toMatch(/path.startsWith\("\/inbox\/"\).*return INBOX_HOME/);
  });

  it("does not own video-call media or a second socket", () => {
    expect(page).not.toMatch(/LiveKitSession|new WebSocket/);
    expect(page).toMatch(/startOutgoingCall/);
    expect(query).not.toMatch(/valkeySet|requireValkey/);
  });
});
