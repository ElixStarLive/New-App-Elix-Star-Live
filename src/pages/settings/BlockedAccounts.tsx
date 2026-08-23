import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Ban, Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { AvatarRing } from "@/components/AvatarRing";
import SettingsOptionSheet from "@/components/SettingsOptionSheet";
import { apiListBlockedUsers, apiUnblockUser } from "@/features/blocks/blockedUsersApi";
import { createBlockedUsersSession } from "@/features/blocks/blockedUsersSession";
import { formatBlockedDate } from "@/features/blocks/formatBlockedDate";
import { SETTINGS_HOME, exitToFromLocationState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

export const BLOCKED_HOME = "/settings/blocked";

export default function BlockedAccounts() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const [searchQuery, setSearchQuery] = useState("");

  const session = useMemo(
    () =>
      createBlockedUsersSession({
        getAccountId: () => useAuthStore.getState().user?.id ?? null,
        listBlockedUsers: apiListBlockedUsers,
        unblockUser: apiUnblockUser,
        toast: showToast,
        onSessionExpired: () => {
          void useAuthStore.getState().checkUser();
        },
      }),
    [],
  );
  const view = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  useEffect(() => {
    void session.load(userId);
  }, [session, userId]);

  const exit = useCallback(() => {
    navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true });
  }, [navigate, location.state]);

  const filteredUsers =
    view.kind === "ready"
      ? view.users.filter((user) => (user.username || "").toLowerCase().includes(searchQuery.toLowerCase()))
      : [];

  return (
    <SettingsOptionSheet onClose={exit} title="Blocked Accounts">
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-shrink-0 px-3 pt-2 pb-3 border-b border-white/10">
          <div className="flex items-center gap-3 rounded-full px-4 py-2.5 border border-white/10">
            <Search className="w-5 h-5 text-[#8B9099] shrink-0" />
            <input
              type="text"
              placeholder="Search blocked users..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-[#8B9099]"
            />
          </div>
        </div>

        <div className="px-3 py-4 overflow-y-auto min-h-0 pb-3 flex-1">
          {view.kind === "loading" ? <div className="text-center py-12 text-[#8B9099]">Loading...</div> : null}
          {view.kind === "error" ? <div className="text-center py-12 text-[#8B9099]">{view.error}</div> : null}
          {view.kind === "ready" ? (
            <>
              {filteredUsers.length > 0 ? (
                <div className="space-y-2.5">
                  {filteredUsers.map((block) => {
                    const pending = view.pendingIds.includes(block.blocked_user_id);
                    return (
                      <div
                        key={block.blocked_user_id}
                        className="flex items-center gap-3 p-3 rounded-xl border border-white/10"
                      >
                        <AvatarRing
                          src={block.avatar_url || "/elix-logo.png"}
                          alt={block.username || block.display_name || "User"}
                          size={48}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[15px] text-white truncate">
                            {block.display_name || block.username || "User"}
                          </p>
                          <p className="text-xs text-white/55 mt-0.5">
                            Blocked {formatBlockedDate(block.created_at || "")}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            void session.unblock(block.blocked_user_id);
                          }}
                          className="px-4 py-2 bg-transparent border border-[#D8D9DD]/40 text-[#F5F5F7] rounded-full text-sm font-semibold hover:bg-white/10 transition shrink-0"
                        >
                          Unblock
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Ban className="w-12 h-12 text-white/20 mx-auto mb-3" />
                  <p className="text-white/40">
                    {searchQuery ? "No blocked users found" : "You haven't blocked anyone"}
                  </p>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </SettingsOptionSheet>
  );
}
