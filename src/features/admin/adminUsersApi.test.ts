import { describe, expect, it } from "vitest";
import { formatAdminJoinedDate } from "@/content/adminUsers";
import { parseAdminUsers } from "./adminApi";

describe("PAGE-071 admin users client parse", () => {
  it("accepts the exact list shape and rejects missing required fields", () => {
    expect(
      parseAdminUsers({
        users: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            username: "maya",
            email: "maya@example.com",
            avatar_url: null,
            created_at: "2026-01-01T00:00:00.000Z",
            is_banned: false,
          },
        ],
      }),
    ).toEqual([
      {
        id: "11111111-1111-4111-8111-111111111111",
        username: "maya",
        email: "maya@example.com",
        avatar_url: null,
        created_at: "2026-01-01T00:00:00.000Z",
        is_banned: false,
      },
    ]);
    expect(parseAdminUsers({ users: [] })).toEqual([]);
    expect(
      parseAdminUsers({
        users: [{ id: "11111111-1111-4111-8111-111111111111", username: "maya" }],
      }),
    ).toBeNull();
    expect(parseAdminUsers({ users: [{ password_hash: "x" }] })).toBeNull();
    expect(parseAdminUsers(null)).toBeNull();
  });

  it("formats joined dates the same way as the frozen Users table", () => {
    expect(formatAdminJoinedDate("")).toBe("N/A");
    expect(formatAdminJoinedDate("not-a-date")).toBe("N/A");
    expect(formatAdminJoinedDate("2026-01-02T00:00:00.000Z")).toBe(
      new Date("2026-01-02T00:00:00.000Z").toLocaleDateString(),
    );
  });
});
