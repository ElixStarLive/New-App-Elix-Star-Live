import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "src/features/profile");
const session = readFileSync(resolve(root, "ownProfileSession.ts"), "utf8");
const api = readFileSync(resolve(root, "ownProfileApi.ts"), "utf8");
const page = readFileSync(resolve(process.cwd(), "src/pages/OwnProfile.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("PAGE-024 own-profile ownership", () => {
  it("uses session-derived GET /api/profiles/me, not a client user id", () => {
    expect(api).toMatch(/\/api\/profiles\/me/);
    expect(api).not.toMatch(/\/api\/profiles\/\$\{/);
    expect(session).toMatch(/apiFetchOwnProfile/);
    expect(session).not.toMatch(/setTimeout/);
  });

  it("does not client-filter a generic video catalog", () => {
    expect(api).not.toMatch(/\/api\/videos"/);
    expect(page).not.toMatch(/\/api\/videos"/);
    expect(api).toMatch(/apiFetchUserVideos/);
    expect(api).toMatch(/apiFetchSavedFeed/);
    expect(api).toMatch(/apiFetchLikedFeed/);
  });

  it("keeps one /profile owner and does not fork ProfileV2 leftovers", () => {
    expect(app).toMatch(/path="\/profile" element=\{<OwnProfile \/>\}/);
    expect(page).not.toMatch(/ProfileOld|ProfileNew|ProfileFixed|ProfileV2/);
    expect(session).not.toMatch(/isLive/);
  });
});
