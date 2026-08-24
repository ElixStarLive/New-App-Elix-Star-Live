import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const api = readFileSync(resolve(process.cwd(), "src/features/profile/editProfileApi.ts"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/profile/editProfileSession.ts"), "utf8");
const page = readFileSync(resolve(process.cwd(), "src/pages/EditProfile.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/profile/router.ts"), "utf8");
const feed = readFileSync(resolve(process.cwd(), "src/features/feed/feedApi.ts"), "utf8");

describe("PAGE-026 edit-profile ownership", () => {
  it("uses one /edit-profile route and session-derived PATCH /me", () => {
    expect(app).toMatch(/path="\/edit-profile" element=\{<EditProfile \/>\}/);
    expect(api).toMatch(/\/api\/profiles\/me/);
    expect(api).not.toMatch(/\/api\/profiles\/\$\{/);
    expect(session).toMatch(/apiSaveEditProfile/);
    expect(session).not.toMatch(/setTimeout/);
    expect(page).not.toMatch(/location\.reload|window\.location/);
    expect(page).not.toMatch(/EditProfileOld|EditProfileNew|EditProfileFixed|EditProfileV2/);
  });

  it("does not accept client avatar URLs or other-user PATCH", () => {
    expect(router).toMatch(/router\.patch\("\/me"/);
    expect(router).not.toMatch(/body\.avatarUrl/);
    expect(router).not.toMatch(/router\.patch\("\/:userId"/);
    expect(feed).not.toMatch(/apiPatchProfile/);
    expect(feed).not.toMatch(/apiUploadAvatar/);
  });
});
