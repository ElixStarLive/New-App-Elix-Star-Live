import { describe, expect, it } from "vitest";
import {
  ADMIN_USERS_LIMIT,
  ADMIN_USERS_LIST_SQL,
  ADMIN_USERS_REASON_MAX,
  ADMIN_USERS_SEARCH_MAX,
  escapeAdminUserLike,
  isAdminUserId,
  parseAdminUsersQuery,
  parseOptionalBanReason,
  parseOptionalBanUntil,
} from "./users.js";

describe("PAGE-071 admin users contract", () => {
  it("lists a bounded newest-first search on username and email", () => {
    expect(ADMIN_USERS_LIST_SQL).toContain("LIMIT 500");
    expect(ADMIN_USERS_LIMIT).toBe(500);
    expect(ADMIN_USERS_LIST_SQL).toContain("ORDER BY created_at DESC NULLS LAST");
    expect(ADMIN_USERS_LIST_SQL).toContain("LOWER(username) LIKE $2");
    expect(ADMIN_USERS_LIST_SQL).toContain("LOWER(email) LIKE $2");
    expect(ADMIN_USERS_LIST_SQL).toContain("deleted_at IS NULL");
    expect(ADMIN_USERS_LIST_SQL).not.toContain("password_hash");
    expect(ADMIN_USERS_LIST_SQL).not.toContain("is_admin");
    expect(ADMIN_USERS_LIST_SQL).not.toContain("${");
    expect(ADMIN_USERS_LIST_SQL).not.toContain("elix_auth_users");
  });

  it("escapes LIKE wildcards and bounds search input", () => {
    expect(escapeAdminUserLike("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
    expect(parseAdminUsersQuery("  Maya  ")).toBe("Maya");
    expect(parseAdminUsersQuery("x".repeat(ADMIN_USERS_SEARCH_MAX + 20))).toHaveLength(ADMIN_USERS_SEARCH_MAX);
    expect(parseAdminUsersQuery(12)).toBe("");
    expect(isAdminUserId("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isAdminUserId("not-a-uuid")).toBe(false);
  });

  it("accepts optional until/reason without inventing a required duration", () => {
    expect(parseOptionalBanUntil(undefined)).toBeNull();
    expect(parseOptionalBanUntil("2030-01-01T00:00:00.000Z")?.toISOString()).toBe("2030-01-01T00:00:00.000Z");
    expect(() => parseOptionalBanUntil("nope")).toThrow(/Invalid until date/);
    expect(parseOptionalBanReason("Banned by admin")).toBe("Banned by admin");
    expect(() => parseOptionalBanReason("x".repeat(ADMIN_USERS_REASON_MAX + 1))).toThrow(/too long/);
  });
});
