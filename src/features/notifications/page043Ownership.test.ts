import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/settings/NotificationSettings.tsx"), "utf8");
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const settings = readFileSync(resolve(process.cwd(), "src/pages/Settings.tsx"), "utf8");
const store = readFileSync(resolve(process.cwd(), "src/store/useSettingsStore.ts"), "utf8");
const auth = readFileSync(resolve(process.cwd(), "src/store/useAuthStore.ts"), "utf8");
const push = readFileSync(resolve(process.cwd(), "src/lib/pushRegister.ts"), "utf8");
const api = readFileSync(resolve(process.cwd(), "src/features/notifications/deviceTokenApi.ts"), "utf8");
const session = readFileSync(resolve(process.cwd(), "src/features/notifications/deviceTokenSession.ts"), "utf8");
const router = readFileSync(resolve(process.cwd(), "server/modules/push/router.ts"), "utf8");
const send = readFileSync(resolve(process.cwd(), "server/modules/push/send.ts"), "utf8");
const notify = readFileSync(resolve(process.cwd(), "server/modules/misc/routers.ts"), "utf8");
const jobs = readFileSync(resolve(process.cwd(), "server/infra/jobs.ts"), "utf8");
const login = readFileSync(resolve(process.cwd(), "src/pages/Login.tsx"), "utf8");
const alerts = readFileSync(resolve(process.cwd(), "src/pages/alerts/AlertsPage.tsx"), "utf8");

describe("PAGE-043 Notification Settings ownership", () => {
  it("has one /settings/notifications option-sheet owner", () => {
    expect(app.match(/path="\/settings\/notifications"/g)?.length).toBe(1);
    expect(app).not.toMatch(/path="\/notifications\/settings"|path="\/settings\/push"|path="\/push-settings"/);
    expect(page).toMatch(/SettingsOptionSheet/);
    expect(page).toMatch(/title="Notifications"/);
    expect(page).not.toMatch(/SettingsSubpage|NotificationSettingsV2|NotificationSettingsFixed/);
    expect(page).not.toMatch(/history\.back|navigate\(-1\)|location\.reload|setTimeout\(/);
    expect(page).not.toMatch(/\/api\/notifications\/prefs|WebSocket|wsClient|new WebSocket/);
    expect(settings).toMatch(/go\("\/settings\/notifications"\)/);
  });

  it("uses one local preference owner and one device-token contract", () => {
    expect(store).toMatch(/name: "settings_v1"/);
    expect(store).toMatch(/notificationsEnabled: true/);
    expect(store).toMatch(/liveNotifications: true/);
    expect(page).toMatch(/setNotificationsEnabled/);
    expect(page).toMatch(/setLiveNotifications/);
    expect(settings).toMatch(/setLiveNotifications/);
    expect(api).toMatch(/\/api\/device-tokens/);
    expect(api).not.toMatch(/\/api\/notifications\/device-tokens/);
    expect(api.match(/\/api\/device-tokens/g)?.length).toBe(2);
    expect(push).toMatch(/registerCurrentDeviceToken/);
    expect(push).toMatch(/notificationsEnabled/);
    expect(push).not.toMatch(/AIza|AAAA[A-Za-z0-9_-]{20,}|-----BEGIN PRIVATE KEY-----/);
    expect(session).toMatch(/unregisterCurrentDeviceToken/);
    expect(auth).toMatch(/unregisterCurrentDeviceToken/);
    expect(router).toMatch(/deviceTokenRegisterBodySchema/);
    expect(router).toMatch(/deviceTokenDeleteBodySchema/);
    expect(router).not.toMatch(/req\.body\?\.userId/);
    expect(notify).not.toMatch(/device-tokens/);
  });

  it("keeps Alerts, Login, and push delivery boundaries", () => {
    expect(alerts).not.toMatch(/device-tokens|registerPushToken/);
    expect(login).not.toMatch(/device-tokens|PushNotifications/);
    expect(send).toMatch(/not_configured/);
    expect(send).not.toMatch(/sent:\s*true/);
    expect(jobs).toMatch(/drainPushNotifyJobs/);
    expect(page + api + session + push).not.toMatch(/console\.log\([^\n]*token/);
  });
});
