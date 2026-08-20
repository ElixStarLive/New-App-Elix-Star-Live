import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppLanguage = "en" | "ro" | "es" | "fr" | "de" | "it" | "pt";

const LANGUAGES: AppLanguage[] = ["en", "ro", "es", "fr", "de", "it", "pt"];

export function isLanguageCode(value: string): value is AppLanguage {
  return (LANGUAGES as string[]).includes(value);
}

type SettingsState = {
  muteAllSounds: boolean;
  notificationsEnabled: boolean;
  liveNotifications: boolean;
  language: AppLanguage;
  setMuteAllSounds: (value: boolean) => void;
  setNotificationsEnabled: (value: boolean) => void;
  setLiveNotifications: (value: boolean) => void;
  setLanguage: (value: AppLanguage) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      muteAllSounds: false,
      notificationsEnabled: true,
      liveNotifications: true,
      language: "en",
      setMuteAllSounds: (value) => set({ muteAllSounds: value }),
      setNotificationsEnabled: (value) => set({ notificationsEnabled: value }),
      setLiveNotifications: (value) => set({ liveNotifications: value }),
      setLanguage: (value) => set({ language: isLanguageCode(value) ? value : "en" }),
    }),
    { name: "elix_settings_v1" },
  ),
);
