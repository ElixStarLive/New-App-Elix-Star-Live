import { describe, expect, it } from "vitest";
import { parseAdminReports } from "./adminApi";

describe("PAGE-072 admin reports parse", () => {
  it("accepts the exact list fields and rejects secret or partial rows", () => {
    expect(
      parseAdminReports({
        reports: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            reporter_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            target_type: "user",
            target_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            reason: "spam",
            details: "too many links",
            status: "open",
            created_at: "2026-01-02T00:00:00.000Z",
            reporter: { username: "maya" },
          },
        ],
      }),
    ).toEqual([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        reporter_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        target_type: "user",
        target_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        reason: "spam",
        details: "too many links",
        status: "open",
        created_at: "2026-01-02T00:00:00.000Z",
        reporter: { username: "maya" },
      },
    ]);
    expect(parseAdminReports({ reports: [] })).toEqual([]);
    expect(
      parseAdminReports({
        reports: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", password_hash: "x" }],
      }),
    ).toBeNull();
    expect(parseAdminReports({ reports: [{ targetKind: "user" }] })).toBeNull();
    expect(parseAdminReports(null)).toBeNull();
  });
});
