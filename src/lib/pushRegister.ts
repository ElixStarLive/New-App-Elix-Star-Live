import { Capacitor } from "@capacitor/core";
import { apiRequest } from "@/lib/apiClient";

let registered = false;

export async function registerPushToken(): Promise<void> {
  if (registered || !Capacitor.isNativePlatform()) return;
  // Android FCM requires FirebaseApp. This stack has no Firebase/google-services.json.
  // PushNotifications.register() fatal-crashes the process without it.
  if (Capacitor.getPlatform() !== "ios") return;
  registered = true;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return;
  await PushNotifications.register();
  await PushNotifications.addListener("registration", (token) => {
    void apiRequest("/api/notifications/device-tokens", {
      method: "POST",
      body: JSON.stringify({ token: token.value, platform: Capacitor.getPlatform() }),
    });
  });
}
