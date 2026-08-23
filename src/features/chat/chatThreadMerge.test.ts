import { describe, expect, it } from "vitest";
import { mergeThreadMessages, parseIncomingDm, sortThreadMessages } from "./chatThreadMerge";

const threadA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const threadB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function msg(id: string, threadId: string, createdAt: string, body = "hi"): {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: string;
} {
  return { id, threadId, senderId: "s1", body, createdAt };
}

describe("PAGE-033 message merge", () => {
  it("orders by createdAt then message id", () => {
    const rows = sortThreadMessages([
      msg("b", threadA, "2026-08-21T00:00:01.000Z"),
      msg("a", threadA, "2026-08-21T00:00:01.000Z"),
      msg("c", threadA, "2026-08-21T00:00:00.000Z"),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["c", "a", "b"]);
  });

  it("dedupes REST and WS by canonical message id and drops the other thread", () => {
    const first = msg("m1", threadA, "2026-08-21T00:00:00.000Z", "one");
    const merged = mergeThreadMessages(
      [first],
      [first, msg("m2", threadA, "2026-08-21T00:00:01.000Z", "two"), msg("x", threadB, "2026-08-21T00:00:02.000Z")],
      threadA,
    );
    expect(merged.map((row) => row.id)).toEqual(["m1", "m2"]);
  });

  it("parses only the nested dm_message contract for the open thread", () => {
    expect(
      parseIncomingDm(
        {
          threadId: threadA,
          message: msg("m1", threadA, "2026-08-21T00:00:00.000Z"),
        },
        threadA,
      )?.id,
    ).toBe("m1");
    expect(parseIncomingDm({ id: "m1", senderId: "s", body: "x", threadId: threadA }, threadA)).toBeNull();
    expect(
      parseIncomingDm(
        { threadId: threadB, message: msg("m1", threadB, "2026-08-21T00:00:00.000Z") },
        threadA,
      ),
    ).toBeNull();
  });
});
