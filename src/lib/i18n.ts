import { languageShortCode, WORLD_LANGUAGES, type LanguageCode } from "./languages";
import { useSettingsStore } from "@/store/useSettingsStore";

export const LANGUAGES = WORLD_LANGUAGES;

export const LANGUAGE_SHORT: Record<LanguageCode, string> = Object.fromEntries(
  WORLD_LANGUAGES.map((language) => [language.code, languageShortCode(language.code)]),
) as Record<LanguageCode, string>;

const ENGLISH: Record<string, string> = {
  "settings.title": "Settings",
  "settings.section.account": "Account",
  "settings.editProfile": "Edit Profile",
  "settings.privacy": "Privacy",
  "settings.security": "Security",
  "settings.deleteAccount": "Delete Account",
  "settings.section.preferences": "Preferences",
  "settings.notifications": "Notifications",
  "settings.liveNotifications": "Live notifications",
  "settings.darkMode": "Dark Mode",
  "settings.language": "Language",
  "settings.section.content": "Content",
  "settings.videoQuality": "Video Quality",
  "settings.likedVideos": "Liked Videos",
  "settings.section.safety": "Safety",
  "settings.blockedAccounts": "Blocked Accounts",
  "settings.safetyCenter": "Safety Center",
  "settings.section.support": "Support",
  "settings.helpSupport": "Help & Support",
  "settings.chooseLanguage": "Choose language",
  "common.terms": "Terms",
  "common.privacy": "Privacy",
  "common.guidelines": "Guidelines",
  "common.logout": "Log Out",
  "common.delete": "Delete",
  "common.on": "On",
  "common.off": "Off",
  "common.auto": "Auto",
  "toast.darkModeAlwaysOn": "Dark mode is always on",
  "toast.videoQualityAuto": "Video quality is set to auto",
};

export function translateSettings(key: string): string {
  return ENGLISH[key] ?? key;
}

export function useT() {
  const lang = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  return { t: translateSettings, lang, setLang: setLanguage };
}
