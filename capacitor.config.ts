import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.elixstarlive.app",
  appName: "Elix Star Live",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    CapacitorHttp: { enabled: true },
    Keyboard: { resize: "none" },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
  ios: {
    contentInset: "never",
  },
};

export default config;
