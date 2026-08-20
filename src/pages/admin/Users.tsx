import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiBanUser, apiFetchAdminUsers, type AdminUserRow } from "@/features/admin/adminApi";
import { PageScaffold } from "@/components/PageScaffold";
import { showToast } from "@/lib/toast";

export default function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void apiFetchAdminUsers().then((res) => {
      if (res.error) setError(res.error);
      else setUsers(res.users);
    });
  }, []);
  return (
    <PageScaffold title="Users" onClose={() => navigate("/admin", { replace: true })}>
      {error ? <p className="px-4 text-rose-300 text-sm">{error}</p> : null}
      <div className="px-3 py-2">
        {users.map((u) => (
          <div key={u.id} className="py-2 border-b border-white/10 text-sm flex items-center gap-2">
            <span className="flex-1 min-w-0 truncate">@{u.username} · {u.email} {u.isAdmin ? "· admin" : ""} {u.banned ? "· banned" : ""}</span>
            <button
              type="button"
              className="text-xs border border-white/20 rounded-full px-3 py-1 shrink-0"
              onClick={() => {
                void apiBanUser(u.id, !u.banned).then((r) => {
                  if (!r.ok) showToast(r.error);
                  else setUsers((prev) => prev.map((row) => (row.id === u.id ? { ...row, banned: !u.banned } : row)));
                });
              }}
            >
              {u.banned ? "Unban" : "Ban"}
            </button>
          </div>
        ))}
      </div>
    </PageScaffold>
  );
}
