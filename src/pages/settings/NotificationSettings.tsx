import { useEffect } from "react";
import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import { useSettingsStore } from "@/store/useSettingsStore";
import { SettingsSubpage } from "./SettingsSubpage";

export default function NotificationSettings() {
  const enabled = useSettingsStore((s) => s.notificationsEnabled);
  const setEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
  const live = useSettingsStore((s) => s.liveNotifications);
  const setLive = useSettingsStore((s) => s.setLiveNotifications);

  useEffect(() => {
    void apiRequest<unknown>("/api/notifications/prefs").then((res) => {
      if (res.error || !isRecord(res.data)) return;
      if (typeof res.data.system === "boolean") setEnabled(res.data.system);
      if (typeof res.data.live === "boolean") setLive(res.data.live);
    });
  }, [setEnabled, setLive]);

  return (
    <SettingsSubpage title="Notifications">
      <div className="px-4 py-3 space-y-3">
        <label className="flex items-center justify-between py-2">
          <span>Push notifications</span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              const next = e.target.checked;
              setEnabled(next);
              void apiRequest("/api/notifications/prefs", {
                method: "PATCH",
                body: JSON.stringify({ system: next }),
              });
            }}
          />
        </label>
        <label className="flex items-center justify-between py-2">
          <span>Live notifications</span>
          <input
            type="checkbox"
            checked={live}
            onChange={(e) => {
              const next = e.target.checked;
              setLive(next);
              void apiRequest("/api/notifications/prefs", {
                method: "PATCH",
                body: JSON.stringify({ live: next }),
              });
            }}
          />
        </label>
      </div>
    </SettingsSubpage>
  );
}
