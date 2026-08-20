import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";
import { SettingsSubpage } from "./SettingsSubpage";
import { isRecord } from "@/lib/isRecord";
import { AvatarRing } from "@/components/AvatarRing";
import { showToast } from "@/lib/toast";

export default function BlockedAccounts() {
  const [users, setUsers] = useState<Array<{ id: string; username: string; avatarUrl: string | null }>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiRequest<unknown>("/api/safety/blocked").then((res) => {
      if (res.error) {
        setError(res.error.message);
        return;
      }
      const list = Array.isArray(res.data) ? res.data : isRecord(res.data) && Array.isArray(res.data.users) ? res.data.users : [];
      const parsed: Array<{ id: string; username: string; avatarUrl: string | null }> = [];
      for (const raw of list) {
        if (!isRecord(raw) || typeof raw.id !== "string") continue;
        parsed.push({
          id: raw.id,
          username: typeof raw.username === "string" ? raw.username : "user",
          avatarUrl: typeof raw.avatarUrl === "string" ? raw.avatarUrl : null,
        });
      }
      setUsers(parsed);
    });
  }, []);

  return (
    <SettingsSubpage title="Blocked accounts">
      {error ? <p className="px-4 text-rose-300 text-sm">{error}</p> : null}
      <div className="px-3 py-2">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 py-2">
            <AvatarRing src={u.avatarUrl} alt={u.username} size={36} />
            <span className="flex-1 text-sm">@{u.username}</span>
            <button
              type="button"
              className="text-xs border border-white/20 rounded-full px-3 py-1"
              onClick={() => {
                void apiRequest(`/api/safety/blocked/${u.id}`, { method: "DELETE" }).then((r) => {
                  if (r.error) showToast(r.error.message);
                  else setUsers((prev) => prev.filter((x) => x.id !== u.id));
                });
              }}
            >
              Unblock
            </button>
          </div>
        ))}
        {users.length === 0 && !error ? <p className="text-white/40 text-sm text-center py-8">No blocked accounts</p> : null}
      </div>
    </SettingsSubpage>
  );
}
