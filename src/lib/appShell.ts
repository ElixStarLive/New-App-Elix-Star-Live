/** Single PAGE-006 route classification. Visual chrome is applied only by App. */

export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/auth/callback" ||
    pathname === "/terms" ||
    pathname === "/privacy" ||
    pathname === "/copyright" ||
    pathname === "/legal" ||
    pathname.startsWith("/legal/") ||
    pathname === "/guidelines" ||
    pathname === "/how-it-works" ||
    pathname === "/support" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/creator/login-details"
  );
}

export function bounceAuthenticatedAuthPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/register";
}

/** Routes that never show the home tab bar. */
export function isShellNavHiddenPath(pathname: string): boolean {
  if (
    pathname === "/auth/callback" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password"
  ) {
    return true;
  }
  return (
    pathname === "/live" ||
    pathname.startsWith("/live/") ||
    pathname.startsWith("/watch/") ||
    pathname === "/create" ||
    pathname.startsWith("/create/") ||
    pathname === "/upload" ||
    pathname === "/ai-studio" ||
    pathname === "/login" ||
    pathname === "/register" ||
    /^\/inbox\/[^/]+$/.test(pathname) ||
    pathname === "/call" ||
    pathname.startsWith("/call/")
  );
}

export function isFeedWithTopBarPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/feed";
}

export function isFeedNoTopBarPath(pathname: string): boolean {
  return pathname === "/stem" || pathname === "/following" || pathname === "/friends";
}

export function isFeedFullScreenPath(pathname: string): boolean {
  return isFeedWithTopBarPath(pathname) || isFeedNoTopBarPath(pathname);
}

export function isFullScreenPath(pathname: string): boolean {
  return isFeedFullScreenPath(pathname) || pathname.startsWith("/video/");
}

export function showBottomNavFor(pathname: string, isAuthenticated: boolean): boolean {
  return isAuthenticated && !isShellNavHiddenPath(pathname);
}

export function isTopNavVisiblePath(pathname: string): boolean {
  return pathname === "/feed";
}

export function isLiveNotifySurfacePath(pathname: string): boolean {
  return (
    pathname.startsWith("/live") ||
    pathname.startsWith("/watch") ||
    pathname.startsWith("/create")
  );
}

/** Host/spectator/call rooms own the singleton WS. Discover `/live` stays on feed presence. */
export function isLiveSessionPath(pathname: string): boolean {
  if (pathname === "/live") return false;
  return (
    pathname.startsWith("/live/") ||
    pathname.startsWith("/watch/") ||
    pathname === "/call" ||
    pathname.startsWith("/call/")
  );
}
