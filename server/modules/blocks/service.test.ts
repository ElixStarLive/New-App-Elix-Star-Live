import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../middleware/errors.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const queryMock = vi.fn();

vi.mock("../../infra/postgres.js", () => ({
  getPool: () => ({ query: queryMock }),
}));

import { deleteBlock, insertBlock, isBlockedEitherWay, listBlockedUsers } from "./service.js";

const blocker = "11111111-1111-4111-8111-111111111111";
const target = "22222222-2222-4222-8222-222222222222";

describe("PAGE-044 block relationship service", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("lists hydrated rows newest first from Neon blocks", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          blocked_user_id: target,
          username: "maya",
          display_name: "Maya",
          avatar_url: null,
          created_at: new Date("2026-08-21T00:00:00.000Z"),
        },
      ],
    });
    await expect(listBlockedUsers(blocker)).resolves.toEqual([
      {
        blockedUserId: target,
        username: "maya",
        displayName: "Maya",
        avatarUrl: null,
        createdAt: "2026-08-21T00:00:00.000Z",
      },
    ]);
    expect(String(queryMock.mock.calls[0]?.[0])).toContain("ORDER BY b.created_at DESC");
    expect(String(queryMock.mock.calls[0]?.[0])).toContain("u.deleted_at IS NULL");
    expect(queryMock.mock.calls[0]?.[1]).toEqual([blocker]);
  });

  it("rejects self block, malformed ids, and missing targets before write", async () => {
    await expect(insertBlock(blocker, blocker)).rejects.toMatchObject({
      message: "Cannot block yourself",
      status: 400,
    });
    await expect(insertBlock(blocker, "not-a-user")).rejects.toBeInstanceOf(AppError);
    queryMock.mockResolvedValueOnce({ rows: [] });
    await expect(insertBlock(blocker, target)).rejects.toMatchObject({
      message: "User not found",
      status: 404,
    });
    expect(queryMock.mock.calls.some((row) => String(row[0]).includes("INSERT INTO blocks"))).toBe(false);
  });

  it("inserts and deletes only the session blocker pair", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: target }] });
    queryMock.mockResolvedValueOnce({ rows: [] });
    await insertBlock(blocker, target);
    expect(String(queryMock.mock.calls[1]?.[0])).toContain("INSERT INTO blocks");
    expect(queryMock.mock.calls[1]?.[1]).toEqual([blocker, target]);

    queryMock.mockReset();
    queryMock.mockResolvedValueOnce({ rows: [] });
    await deleteBlock(blocker, target);
    expect(String(queryMock.mock.calls[0]?.[0])).toContain("DELETE FROM blocks");
    expect(queryMock.mock.calls[0]?.[1]).toEqual([blocker, target]);
    await expect(deleteBlock(blocker, blocker)).rejects.toMatchObject({
      message: "Cannot unblock yourself",
      status: 400,
    });
  });

  it("reports either-way block from the same blocks table", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    await expect(isBlockedEitherWay(blocker, target)).resolves.toBe(true);
    queryMock.mockResolvedValueOnce({ rows: [] });
    await expect(isBlockedEitherWay(blocker, target)).resolves.toBe(false);
  });

  it("does not keep process-local block authority", () => {
    const source = readFileSync(resolve(process.cwd(), "server/modules/blocks/service.ts"), "utf8");
    expect(source).not.toMatch(/\bnew Map\b|\bconst blocks\s*=\s*\[/);
    expect(source).not.toMatch(/localStorage|sessionStorage/);
  });
});
