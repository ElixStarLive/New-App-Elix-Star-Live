import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "src/features/profile");
const session = readFileSync(resolve(root, "publicProfileSession.ts"), "utf8");
const api = readFileSync(resolve(root, "publicProfileApi.ts"), "utf8");
const page = readFileSync(resolve(process.cwd(), "src/pages/Profile.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const own = readFileSync(resolve(process.cwd(), "src/pages/OwnProfile.tsx"), "utf8");

describe("PAGE-025 public-profile ownership", () => {
  it("uses one public route owner and does not fetch /me", () => {
    expect(app).toMatch(/path="\/profile\/:userId" element=\{<Profile \/>\}/);
    expect(app).toMatch(/path="\/profile" element=\{<OwnProfile \/>\}/);
    expect(api).not.toMatch(/\/api\/profiles\/me/);
    expect(session).not.toMatch(/\/api\/profiles\/me/);
    expect(page).not.toMatch(/\/api\/profiles\/me/);
    expect(page).not.toMatch(/apiFetchOwnProfile/);
    expect(session).not.toMatch(/setTimeout/);
    expect(page).not.toMatch(/ProfileOld|PublicProfileNew|PublicProfileFixed|ProfileV2/);
  });

  it("keeps private/self-only controls on Own Profile only", () => {
    expect(own).toMatch(/private/);
    expect(page).not.toMatch(/"private"/);
    expect(page).not.toMatch(/Edit Profile/);
    expect(page).not.toMatch(/Add story/);
    expect(page).not.toMatch(/Settings/);
    expect(api).toMatch(/apiFetchUserVideos/);
    expect(api).not.toMatch(/\/api\/videos"/);
    expect(page).not.toMatch(/\/api\/videos"/);
  });

  it("uses shared follow helpers and live-core watch roomId", () => {
    expect(api).toMatch(/apiFollow\(/);
    expect(api).toMatch(/apiUnfollow\(/);
    expect(page).toMatch(/\/watch\/\$\{profile\.id\}/);
    expect(page).not.toMatch(/streamId \|\|/);
    expect(page).not.toMatch(/hostId/);
  });
});
