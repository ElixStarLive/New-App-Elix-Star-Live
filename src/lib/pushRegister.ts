import { Capacitor } from "@capacitor/core";
import {
  registerCurrentDeviceToken,
  unregisterCurrentDeviceToken,
} from "@/features/notifications/deviceTokenSession";
import { useAuthStore } from "@/store/useAuthStore";
import { useSettingsStore } from "@/store/useSettingsStore";

let listenersAttached = false;

export function resetPushRegisterForTests(): void {
  listenersAttached = false;
}

function isSupportedNativePushPlatform(): boolean {
  if (!Capacitor.isNativePlatform()) return false;
  const platform = Capacitor.getPlatform();
  return platform === "ios" || platform === "android";
}

/** Register FCM (Android) / APNs (iOS) token when local app-notifications preference is on. */
export async function registerPushToken(): Promise<void> {
  try {
    if (!useSettingsStore.getState().notificationsEnabled) return;
    if (!useAuthStore.getState().user?.id) return;
    if (!isSupportedNativePushPlatform()) return;

    // Android FCM requires FirebaseApp (google-services.json). Calling register() without it
    // hard-crashes the Capacitor plugin thread and kills the process — skip until wired.
    if (
      Capacitor.getPlatform() === "android" &&
      String(import.meta.env.VITE_ANDROID_FCM_ENABLED || "").trim() !== "true"
    ) {
      return;
    }

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
  } catch {
    return;
  }
}

/** Remove this device's server token for the current account/platform (disable / logout path). */
export async function unregisterPushToken(): Promise<void> {
  if (!isSupportedNativePushPlatform()) return;
  await unregisterCurrentDeviceToken();
}
