import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ban, Search } from "lucide-react";
import {
  ADMIN_USERS_BAN_CONFIRM,
  ADMIN_USERS_BAN_FAILURE,
  ADMIN_USERS_BAN_REASON,
  ADMIN_USERS_BAN_SUCCESS,
  ADMIN_USERS_DEFAULT_AVATAR,
  ADMIN_USERS_ERROR,
  ADMIN_USERS_HOME,
  ADMIN_USERS_LOADING,
  ADMIN_USERS_SEARCH_PLACEHOLDER,
  ADMIN_USERS_TITLE,
  ADMIN_USERS_UNBAN_CONFIRM,
  ADMIN_USERS_UNBAN_FAILURE,
  ADMIN_USERS_UNBAN_SUCCESS,
  formatAdminJoinedDate,
} from "@/content/adminUsers";
import {
  apiAdminBanUser,
  apiAdminUnbanUser,
  apiFetchAdminUsers,
  type AdminUserRow,
} from "@/features/admin/adminApi";
import { containerReturnState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

export default function AdminUsers() {
  const navigate = useNavigate();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const isAdmin = useAuthStore((state) => state.user?.isAdmin === true);
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<Record<string, true>>({});
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!isAdmin || !userId) {
      setUsers(null);
      setError(null);
      setReady(false);
      setListLoading(false);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const ownerId = userId;
    const query = searchQuery;
    setUsers(null);
    setError(null);
    setListLoading(true);
    void apiFetchAdminUsers(query).then((result) => {
      if (requestIdRef.current !== requestId) return;
      if (useAuthStore.getState().user?.id !== ownerId) return;
      if (useAuthStore.getState().user?.isAdmin !== true) {
        setUsers(null);
        setError(null);
        setListLoading(false);
        setReady(false);
        return;
      }
      if (result.error || !result.users) {
        setUsers(null);
        setError(result.error || ADMIN_USERS_ERROR);
        setListLoading(false);
        setReady(true);
        return;
      }
      setUsers(result.users);
      setError(null);
      setListLoading(false);
      setReady(true);
    });
  }, [isAdmin, userId, searchQuery]);

  const goProfile = useCallback(
    (targetId: string) => {
      navigate(`/profile/${targetId}`, { state: containerReturnState(ADMIN_USERS_HOME) });
    },
    [navigate],
  );

  const setPending = (targetId: string, pending: boolean) => {
    setPendingIds((current) => {
      if (pending) return { ...current, [targetId]: true };
      const next = { ...current };
      delete next[targetId];
      return next;
    });
  };

  const handleBanUser = async (target: AdminUserRow) => {
    if (pendingIds[target.id]) return;
    if (!window.confirm(ADMIN_USERS_BAN_CONFIRM)) return;
    setPending(target.id, true);
    const result = await apiAdminBanUser(target.id, ADMIN_USERS_BAN_REASON);
    if (useAuthStore.getState().user?.isAdmin !== true) {
      setPending(target.id, false);
      return;
    }
    if (!result.ok) {
      showToast(ADMIN_USERS_BAN_FAILURE);
      setPending(target.id, false);
      return;
    }
    setUsers((current) =>
      current
        ? current.map((row) => (row.id === target.id ? { ...row, isBanned: true } : row))
        : current,
    );
    showToast(ADMIN_USERS_BAN_SUCCESS);
    setPending(target.id, false);
  };

  const handleUnbanUser = async (target: AdminUserRow) => {
    if (pendingIds[target.id]) return;
    if (!window.confirm(ADMIN_USERS_UNBAN_CONFIRM)) return;
    setPending(target.id, true);
    const result = await apiAdminUnbanUser(target.id);
    if (useAuthStore.getState().user?.isAdmin !== true) {
      setPending(target.id, false);
      return;
    }
    if (!result.ok) {
      showToast(ADMIN_USERS_UNBAN_FAILURE);
      setPending(target.id, false);
      return;
    }
    setUsers((current) =>
      current
        ? current.map((row) => (row.id === target.id ? { ...row, isBanned: false } : row))
        : current,
    );
    showToast(ADMIN_USERS_UNBAN_SUCCESS);
    setPending(target.id, false);
  };

  if (!ready && listLoading) {
    return (
      <div className="min-h-screen elix-page-glass bg-transparent flex items-center justify-center text-white" aria-busy="true">
        {ADMIN_USERS_LOADING}
      </div>
    );
  }

  return (
    <div className="min-h-screen elix-page-glass bg-transparent text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">{ADMIN_USERS_TITLE}</h1>

        <div className="mb-6 flex items-center gap-4 bg-transparent rounded-lg px-4 py-3">
          <Search className="w-5 h-5 text-white" />
          <input
            type="text"
            placeholder={ADMIN_USERS_SEARCH_PLACEHOLDER}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            aria-label={ADMIN_USERS_SEARCH_PLACEHOLDER}
            className="flex-1 bg-transparent outline-none text-white min-w-0"
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-rose-300 mb-6">
            {error}
          </p>
        ) : (
          <div className="bg-transparent rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-[rgba(255,255,255,0.06)]">
                <tr>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Joined</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {listLoading || !users ? (
                  <tr>
                    <td className="px-4 py-3 text-white" colSpan={4} aria-busy="true">
                      {ADMIN_USERS_LOADING}
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-[rgba(255,255,255,0.06)]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full overflow-hidden shrink-0">
                            <img
                              src={user.avatarUrl || ADMIN_USERS_DEFAULT_AVATAR}
                              alt={user.username}
                              className="w-full h-full object-cover object-center"
                            />
                          </div>
                          <span className="font-semibold truncate">{user.username}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-400 max-w-[12rem] truncate">{user.email}</td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{formatAdminJoinedDate(user.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => goProfile(user.id)}
                            className="px-3 py-1 bg-[#E6E9EE] rounded hover:bg-[#E6E9EE] text-sm"
                          >
                            View
                          </button>
                          {user.isBanned ? (
                            <button
                              type="button"
                              disabled={Boolean(pendingIds[user.id])}
                              onClick={() => void handleUnbanUser(user)}
                              className="px-3 py-1 bg-white/25 rounded hover:bg-white/30 text-sm"
                            >
                              Unban
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={Boolean(pendingIds[user.id])}
                              onClick={() => void handleBanUser(user)}
                              className="px-3 py-1 bg-white/25 rounded hover:bg-white/30 text-sm flex items-center gap-1"
                            >
                              <Ban className="w-4 h-4" />
                              Ban
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
