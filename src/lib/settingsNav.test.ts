import { describe, expect, it } from "vitest";
import { namedHardwareBackTarget } from "./settingsNav";

describe("PAGE-006 named hardware back", () => {
  it("stays on For You instead of WebView history", () => {
    expect(namedHardwareBackTarget("/feed")).toBeNull();
  });

  it("returns Search to For You", () => {
    expect(namedHardwareBackTarget("/search")).toBe("/feed");
  });

  it("returns Search to STEM when opened from STEM", () => {
    expect(namedHardwareBackTarget("/search", { returnTo: "/stem" })).toBe("/stem");
  });

  it("returns STEM to For You", () => {
    expect(namedHardwareBackTarget("/stem")).toBe("/feed");
  });

  it("returns Discover to For You", () => {
    expect(namedHardwareBackTarget("/discover")).toBe("/feed");
  });

  it("returns Music/Sound to For You unless opened with returnTo", () => {
    expect(namedHardwareBackTarget("/music")).toBe("/feed");
    expect(namedHardwareBackTarget("/music/track-1")).toBe("/feed");
    expect(namedHardwareBackTarget("/music/track-1", { returnTo: "/video/abc" })).toBe("/video/abc");
    expect(namedHardwareBackTarget("/music", { returnTo: "/create" })).toBe("/create");
  });

  it("returns Live Discover to For You", () => {
    expect(namedHardwareBackTarget("/live")).toBe("/feed");
    expect(namedHardwareBackTarget("/live", { returnTo: "/inbox" })).toBe("/inbox");
  });

  it("returns Hashtag to Discover", () => {
    expect(namedHardwareBackTarget("/hashtag/music")).toBe("/discover");
    expect(namedHardwareBackTarget("/hashtag/music", { returnTo: "/feed" })).toBe("/feed");
  });

  it("returns the live profile overlay to the same watch session", () => {
    expect(namedHardwareBackTarget("/watch/room-a/profile/user-b")).toBe("/watch/room-a");
    expect(namedHardwareBackTarget("/watch/room-a")).toBe("/feed");
  });

  it("stays on other root tabs", () => {
    expect(namedHardwareBackTarget("/friends")).toBeNull();
    expect(namedHardwareBackTarget("/inbox")).toBeNull();
    expect(namedHardwareBackTarget("/profile")).toBeNull();
    expect(namedHardwareBackTarget("/create")).toBe("/feed");
  });

  it("returns AI Studio to For You unless opened with returnTo", () => {
    expect(namedHardwareBackTarget("/ai-studio")).toBe("/feed");
    expect(namedHardwareBackTarget("/ai-studio", { returnTo: "/profile" })).toBe("/profile");
  });

  it("returns Settings to Profile and Settings children to Settings", () => {
    expect(namedHardwareBackTarget("/settings")).toBe("/profile");
    expect(namedHardwareBackTarget("/settings/safety")).toBe("/settings");
    expect(namedHardwareBackTarget("/settings/security")).toBe("/settings");
    expect(namedHardwareBackTarget("/settings/notifications")).toBe("/settings");
    expect(namedHardwareBackTarget("/settings/blocked")).toBe("/settings");
    expect(namedHardwareBackTarget("/settings/payout")).toBe("/settings");
    expect(namedHardwareBackTarget("/engagement")).toBe("/settings");
    expect(namedHardwareBackTarget("/engagement/missions")).toBe("/engagement");
    expect(namedHardwareBackTarget("/engagement/fan-level")).toBe("/engagement");
    expect(namedHardwareBackTarget("/engagement/mvp")).toBe("/engagement");
    expect(namedHardwareBackTarget("/engagement/achievements")).toBe("/engagement");
    expect(namedHardwareBackTarget("/engagement/rewards")).toBe("/engagement");
    expect(namedHardwareBackTarget("/engagement/daily-login")).toBe("/engagement");
    expect(namedHardwareBackTarget("/engagement/collections")).toBe("/engagement");
    expect(namedHardwareBackTarget("/rising-stars")).toBe("/feed");
    expect(namedHardwareBackTarget("/rising-stars", { returnTo: "/discover" })).toBe("/discover");
    expect(namedHardwareBackTarget("/rising-stars/challenge/abc")).toBe("/rising-stars");
    expect(namedHardwareBackTarget("/how-it-works")).toBe("/settings");
    expect(namedHardwareBackTarget("/how-it-works", { returnTo: "/settings" })).toBe("/settings");
    expect(namedHardwareBackTarget("/legal")).toBe("/settings");
    expect(namedHardwareBackTarget("/legal", { returnTo: "/support" })).toBe("/support");
    expect(namedHardwareBackTarget("/legal/ugc")).toBe("/settings");
    expect(namedHardwareBackTarget("/legal/ugc", { returnTo: "/legal" })).toBe("/legal");
    expect(namedHardwareBackTarget("/legal/audio")).toBe("/settings");
    expect(namedHardwareBackTarget("/legal/audio", { returnTo: "/legal" })).toBe("/legal");
    expect(namedHardwareBackTarget("/legal/affiliate")).toBe("/settings");
    expect(namedHardwareBackTarget("/legal/affiliate", { returnTo: "/legal" })).toBe("/legal");
    expect(namedHardwareBackTarget("/legal/dmca")).toBe("/settings");
    expect(namedHardwareBackTarget("/legal/dmca", { returnTo: "/legal" })).toBe("/legal");
    expect(namedHardwareBackTarget("/legal/dmca", { returnTo: "/copyright" })).toBe("/copyright");
    expect(namedHardwareBackTarget("/legal/dmca", { returnTo: "/legal/ugc" })).toBe("/legal/ugc");
    expect(namedHardwareBackTarget("/legal/safety")).toBe("/settings");
    expect(namedHardwareBackTarget("/legal/safety", { returnTo: "/legal" })).toBe("/legal");
    expect(namedHardwareBackTarget("/legal/supplier")).toBe("/settings");
    expect(namedHardwareBackTarget("/legal/supplier", { returnTo: "/legal" })).toBe("/legal");
    expect(namedHardwareBackTarget("/settings/safety")).toBe("/settings");
    expect(namedHardwareBackTarget("/admin")).toBe("/settings");
    expect(namedHardwareBackTarget("/admin", { returnTo: "/settings" })).toBe("/settings");
    expect(namedHardwareBackTarget("/admin/users")).toBe("/admin");
    expect(namedHardwareBackTarget("/admin/reports")).toBe("/admin");
    expect(namedHardwareBackTarget("/admin/rising-stars")).toBe("/admin");
    expect(namedHardwareBackTarget("/support")).toBe("/settings");
    expect(namedHardwareBackTarget("/support", { returnTo: "/settings" })).toBe("/settings");
    expect(namedHardwareBackTarget("/support", { returnTo: "/settings/safety" })).toBe("/settings/safety");
    expect(namedHardwareBackTarget("/support", { returnTo: "/how-it-works" })).toBe("/how-it-works");
    expect(namedHardwareBackTarget("/terms")).toBe("/settings");
    expect(namedHardwareBackTarget("/privacy")).toBe("/settings");
    expect(namedHardwareBackTarget("/copyright")).toBe("/settings");
    expect(namedHardwareBackTarget("/copyright", { returnTo: "/legal" })).toBe("/legal");
    expect(namedHardwareBackTarget("/guidelines")).toBe("/settings");
    expect(namedHardwareBackTarget("/guidelines", { returnTo: "/settings" })).toBe("/settings");
    expect(namedHardwareBackTarget("/guidelines", { returnTo: "/settings/safety" })).toBe("/settings/safety");
  });

  it("returns Report to For You unless returnTo is set", () => {
    expect(namedHardwareBackTarget("/report")).toBe("/feed");
    expect(namedHardwareBackTarget("/report", { returnTo: "/settings" })).toBe("/settings");
    expect(namedHardwareBackTarget("/report", { returnTo: "/settings/safety" })).toBe("/settings/safety");
  });

  it("returns Edit Profile to Settings", () => {
    expect(namedHardwareBackTarget("/edit-profile")).toBe("/settings");
    expect(namedHardwareBackTarget("/edit-profile", { returnTo: "/profile" })).toBe("/profile");
  });

  it("returns Purchase Coins to For You", () => {
    expect(namedHardwareBackTarget("/purchase-coins")).toBe("/feed");
    expect(namedHardwareBackTarget("/purchase-coins", { returnTo: "/profile" })).toBe("/profile");
  });

  it("returns Shop item to Shop and Shop to For You", () => {
    expect(namedHardwareBackTarget("/shop")).toBe("/feed");
    expect(namedHardwareBackTarget("/shop/11111111-1111-4111-8111-111111111111")).toBe("/shop");
    expect(namedHardwareBackTarget("/shop/11111111-1111-4111-8111-111111111111", { returnTo: "/inbox" })).toBe(
      "/inbox",
    );
  });

  it("returns Creator login details to Settings", () => {
    expect(namedHardwareBackTarget("/creator/login-details")).toBe("/settings");
    expect(namedHardwareBackTarget("/creator/login-details", { returnTo: "/profile" })).toBe("/profile");
  });

  it("returns Followers to that profile", () => {
    expect(namedHardwareBackTarget("/profile/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/followers")).toBe(
      "/profile/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
    expect(
      namedHardwareBackTarget("/profile/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/followers", { returnTo: "/inbox" }),
    ).toBe("/inbox");
  });

  it("returns Following list to that profile", () => {
    expect(namedHardwareBackTarget("/profile/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/following")).toBe(
      "/profile/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
    expect(
      namedHardwareBackTarget("/profile/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/following", { returnTo: "/inbox" }),
    ).toBe("/inbox");
  });
});
