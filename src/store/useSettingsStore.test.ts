import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "./useSettingsStore";

describe("PAGE-040 shared settings preferences", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      muteAllSounds: false,
      notificationsEnabled: true,
      liveNotifications: true,
      language: "en",
    });
  });

  it("keeps mute, live notifications, app notifications, and language on one device-scoped store", () => {
    useSettingsStore.getState().setMuteAllSounds(true);
    useSettingsStore.getState().setLiveNotifications(false);
    useSettingsStore.getState().setNotificationsEnabled(false);
    useSettingsStore.getState().setLanguage("ja");
    expect(useSettingsStore.getState()).toEqual(
      expect.objectContaining({
        muteAllSounds: true,
        liveNotifications: false,
        notificationsEnabled: false,
        language: "ja",
      }),
    );
  });

  it("rejects an unknown language instead of inventing a locale", () => {
    useSettingsStore.getState().setLanguage("not-a-language" as never);
    expect(useSettingsStore.getState().language).toBe("en");
  });
});
