import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isLanguageCode, type LanguageCode } from "@/lib/languages";

export type AppLanguage = LanguageCode;

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
    { name: "settings_v1" },
  ),
);
