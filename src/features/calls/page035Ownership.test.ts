import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const modal = readFileSync(resolve(process.cwd(), "src/components/IncomingCallModal.tsx"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/calls/videoCallSession.ts"), "utf8");
const page034 = readFileSync(resolve(process.cwd(), "src/pages/VideoCall.tsx"), "utf8");
const clientWs = readFileSync(resolve(process.cwd(), "src/lib/wsClient.ts"), "utf8");

describe("PAGE-035 Incoming Call Modal ownership", () => {
  it("owns one globally mounted modal and no second socket or LiveKit room", () => {
    expect(app.match(/<IncomingCallModal \/>/g)?.length).toBe(1);
    expect(app).toMatch(/bindVideoCallSignals\(user\.id\)/);
    expect(app).toMatch(/\[user\?\.id\]/);
    expect(modal).toMatch(/acceptIncomingCall/);
    expect(modal).toMatch(/rejectIncomingCall/);
    expect(modal).toMatch(/Incoming video call/);
    expect(modal).toMatch(/bg-\[#22C55E\]/);
    expect(modal).toMatch(/bg-\[#EF4444\]/);
    expect(modal).toMatch(/z-\[100\]/);
    expect(modal).not.toMatch(/LiveKitSession|new Room|getUserMedia|new WebSocket|apiCallAction|IncomingCallModalV2|IncomingCallModalFixed|location\.reload|setTimeout|callerId \|\||userId \|\||threadId \|\|/);
    expect(page034).not.toMatch(/IncomingCallModal/);
    expect(session).not.toMatch(/IncomingCallModal|new WebSocket|setTimeout/);
    expect(clientWs).toMatch(/export const wsClient = new WsClient/);
  });
});
