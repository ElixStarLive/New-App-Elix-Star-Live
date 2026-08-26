import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("PAGE-006 App Shell ownership", () => {
  it("keeps one App shell owner with OLD auth redirects and chrome hosts", () => {
    const app = read("src/App.tsx");
    const main = read("src/main.tsx");
    const shell = read("src/lib/appShell.ts");
    const top = read("src/components/TopNav.tsx");
    const bottom = read("src/components/BottomNav.tsx");
    const ws = read("src/lib/wsClient.ts");
    const admin = read("src/components/RequireAdmin.tsx");

    expect(app).toMatch(/isPublicPath|isPublicRoute/);
    expect(app).toMatch(/bounceAuthenticatedAuthPath/);
    expect(app).toMatch(/Navigate to=\{isAuthenticated \? "\/feed" : "\/login"\}/);
    expect(app).toMatch(/path="\*"/);
    expect(app).toMatch(/OfflineBanner/);
    expect(app).toMatch(/IncomingCallModal/);
    expect(app).toMatch(/LiveNotifyBanner/);
    expect(app).toMatch(/showBottomNavFor/);
    expect(app).toMatch(/namedExitForLocation/);
    expect(app).toMatch(/EDGE_SWIPE_WIDTH/);
    expect(app).toMatch(/app-feed-presence/);
    expect(app).toMatch(/wsClient\.connect\("__feed__"/);
    expect(app).toMatch(/wsClient\.disconnect\(\)/);
    expect(app).toMatch(/force_disconnect/);
    expect(app).toMatch(/reconnectOnForeground/);
    expect(app).toMatch(/checkUser/);

    expect(main).toMatch(/NativeDialogProvider/);
    expect(main).toMatch(/ErrorBoundary/);
    expect(main).toMatch(/BrowserRouter/);

    expect(shell).toMatch(/isShellNavHiddenPath/);
    expect(shell).toMatch(/isTopNavVisiblePath/);
    expect(shell).toMatch(/\/watch\//);
    expect(shell).toMatch(/\/ai-studio/);
    expect(shell).toMatch(/\^\\\/inbox\\\/\[\^\/\]\+\$/);

    expect(top).toMatch(/isTopNavVisiblePath/);
    expect(top).toMatch(/LIVE/);
    expect(top).toMatch(/STEM/);
    expect(top).toMatch(/Explore/);
    expect(top).toMatch(/Following/);
    expect(top).toMatch(/Shop/);
    expect(top).toMatch(/For You/);
    expect(top).toMatch(/Search/);

    expect(bottom).toMatch(/Home/);
    expect(bottom).toMatch(/Friends/);
    expect(bottom).toMatch(/Create/);
    expect(bottom).toMatch(/Inbox/);
    expect(bottom).toMatch(/Profile/);
    expect(bottom).not.toMatch(/pathname === "\/live"/);

    expect(ws.match(/new WebSocket/g)?.length).toBe(1);
    expect(ws).toMatch(/export const wsClient/);

    expect(admin).toMatch(/Navigate to="\/"/);
  });
});
