import { Capacitor } from "@capacitor/core";
import { registerCurrentDeviceToken } from "@/features/notifications/deviceTokenSession";
import { useAuthStore } from "@/store/useAuthStore";
import { useSettingsStore } from "@/store/useSettingsStore";

let listenersAttached = false;

export function resetPushRegisterForTests(): void {
  listenersAttached = false;
}

export async function registerPushToken(): Promise<void> {
  if (!useSettingsStore.getState().notificationsEnabled) return;
  if (!useAuthStore.getState().user?.id) return;
  if (!Capacitor.isNativePlatform()) return;
  if (Capacitor.getPlatform() !== "ios") return;

  const { PushNotifications } = await import("@capacitor/push-notifications");
  if (!listenersAttached) {
    listenersAttached = true;
    await PushNotifications.addListener("registration", (token) => {
      if (!useSettingsStore.getState().notificationsEnabled) return;
      if (!useAuthStore.getState().user?.id) return;
      void registerCurrentDeviceToken(token.value).then((result) => {
        if (result.ok === false && result.sessionExpired) {
          void useAuthStore.getState().checkUser();
        }
      });
    });
    await PushNotifications.addListener("registrationError", () => undefined);
  }

  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return;
  await PushNotifications.register();
}
