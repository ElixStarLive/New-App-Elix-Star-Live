import { describe, expect, it } from "vitest";
import {
  bounceAuthenticatedAuthPath,
  isFeedNoTopBarPath,
  isFeedWithTopBarPath,
  isFullScreenPath,
  isLiveNotifySurfacePath,
  isPublicPath,
  isShellNavHiddenPath,
  isTopNavVisiblePath,
  showBottomNavFor,
} from "./appShell";

describe("PAGE-006 app shell classification", () => {
  it("marks completed auth pages as public", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/register")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
    expect(isPublicPath("/forgot-password")).toBe(true);
    expect(isPublicPath("/reset-password")).toBe(true);
    expect(isPublicPath("/feed")).toBe(false);
    expect(isPublicPath("/legal/dmca")).toBe(true);
  });

  it("bounces only login and register when already authenticated", () => {
    expect(bounceAuthenticatedAuthPath("/login")).toBe(true);
    expect(bounceAuthenticatedAuthPath("/register")).toBe(true);
    expect(bounceAuthenticatedAuthPath("/forgot-password")).toBe(false);
    expect(bounceAuthenticatedAuthPath("/reset-password")).toBe(false);
    expect(bounceAuthenticatedAuthPath("/auth/callback")).toBe(false);
  });

  it("hides bottom nav on OLD hide-matrix routes and public auth chrome", () => {
    expect(isShellNavHiddenPath("/live")).toBe(true);
    expect(isShellNavHiddenPath("/live/broadcast")).toBe(true);
    expect(isShellNavHiddenPath("/watch/abc")).toBe(true);
    expect(isShellNavHiddenPath("/create")).toBe(true);
    expect(isShellNavHiddenPath("/upload")).toBe(true);
    expect(isShellNavHiddenPath("/ai-studio")).toBe(true);
    expect(isShellNavHiddenPath("/login")).toBe(true);
    expect(isShellNavHiddenPath("/register")).toBe(true);
    expect(isShellNavHiddenPath("/inbox/thread-1")).toBe(true);
    expect(isShellNavHiddenPath("/inbox")).toBe(false);
    expect(isShellNavHiddenPath("/call")).toBe(true);
    expect(isShellNavHiddenPath("/auth/callback")).toBe(true);
    expect(isShellNavHiddenPath("/forgot-password")).toBe(true);
    expect(isShellNavHiddenPath("/reset-password")).toBe(true);
    expect(isShellNavHiddenPath("/feed")).toBe(false);
    expect(isShellNavHiddenPath("/video/abc")).toBe(false);
    expect(isShellNavHiddenPath("/terms")).toBe(false);
  });

  it("shows top nav only on For You", () => {
    expect(isTopNavVisiblePath("/feed")).toBe(true);
    expect(isFeedWithTopBarPath("/feed")).toBe(true);
    expect(isFeedNoTopBarPath("/stem")).toBe(true);
    expect(isFeedNoTopBarPath("/following")).toBe(true);
    expect(isFeedNoTopBarPath("/friends")).toBe(true);
    expect(isTopNavVisiblePath("/stem")).toBe(false);
    expect(isTopNavVisiblePath("/discover")).toBe(false);
  });

  it("treats video view as full-screen chrome with bottom nav still allowed", () => {
    expect(isFullScreenPath("/video/abc")).toBe(true);
    expect(showBottomNavFor("/video/abc", true)).toBe(true);
    expect(showBottomNavFor("/feed", true)).toBe(true);
    expect(showBottomNavFor("/feed", false)).toBe(false);
    expect(showBottomNavFor("/create", true)).toBe(false);
    expect(showBottomNavFor("/reset-password", true)).toBe(false);
  });

  it("suppresses live notify banners on live surfaces", () => {
    expect(isLiveNotifySurfacePath("/live")).toBe(true);
    expect(isLiveNotifySurfacePath("/watch/x")).toBe(true);
    expect(isLiveNotifySurfacePath("/create")).toBe(true);
    expect(isLiveNotifySurfacePath("/feed")).toBe(false);
  });
});
