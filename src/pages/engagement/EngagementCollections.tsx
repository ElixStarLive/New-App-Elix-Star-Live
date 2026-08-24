import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Gift, Layers, Map, Star } from "lucide-react";
import { RoyceBackIcon } from "@/components/royce";
import {
  apiEngagementCreatorCards,
  apiEngagementStickers,
  apiEngagementTreasure,
  apiEngagementTreasureOpen,
} from "@/features/engagement/engagementCollectionsApi";
import { createEngagementCollectionsSession } from "@/features/engagement/engagementCollectionsSession";
import { ENGAGEMENT_HOME, SETTINGS_HOME, exitToFromLocationState } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/store/useAuthStore";

export default function EngagementCollections() {
  const navigate = useNavigate();
  const location = useLocation();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const session = useMemo(
    () =>
      createEngagementCollectionsSession({
        getAccountId: () => useAuthStore.getState().user?.id ?? null,
        loadTreasure: apiEngagementTreasure,
        loadStickers: apiEngagementStickers,
        loadCards: apiEngagementCreatorCards,
        openChest: apiEngagementTreasureOpen,
        toast: showToast,
        onSessionExpired: () => {
          void useAuthStore.getState().checkUser();
        },
        onDisabled: () => {
          navigate(SETTINGS_HOME, { replace: true });
        },
      }),
    [navigate],
  );
  const view = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  useEffect(() => {
    session.bindAccount(userId);
    if (userId) void session.load(userId);
  }, [session, userId]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const accountId = useAuthStore.getState().user?.id ?? null;
      if (accountId) void session.load(accountId);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [session]);

  const exit = useCallback(() => {
    navigate(exitToFromLocationState(location.state, ENGAGEMENT_HOME), { replace: true });
  }, [navigate, location.state]);

  const inventory = view.kind === "ready" ? view.inventory : null;
  const chests = inventory?.treasure.chests ?? [];
  const sets = inventory?.stickers.sets ?? [];
  const cards = inventory?.cards.unlocked ?? [];

  return (
    <div className="page-above-bottom-nav bg-transparent text-white">
      <div className="page-above-bottom-nav__inner">
        <div className="w-full shrink-0 bg-transparent z-10" style={{ paddingTop: "var(--topnav-anchor-top)" }}>
          <div className="w-full px-3 flex items-center" style={{ minHeight: "var(--topnav-bar-height)" }}>
            <div className="w-10 shrink-0" aria-hidden />
            <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
              <Layers className="w-5 h-5 royce-icon-gold shrink-0" />
              <h1 className="text-base font-semibold truncate">
                <span className="elix-silver-red-text">Collections</span>
              </h1>
            </div>
            <button
              type="button"
              onClick={exit}
              className="w-10 h-10 shrink-0 flex items-center justify-center"
              aria-label="Close"
              title="Close"
            >
              <RoyceBackIcon className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>
        <div className="px-3 pb-6">
          {view.kind === "loading" ? (
            <div className="py-10 text-center text-sm">
              <span className="elix-silver-red-text opacity-50">Loading...</span>
            </div>
          ) : view.kind === "error" ? (
            <div className="py-10 text-center text-sm text-rose-300">{view.error}</div>
          ) : (
            <div className="flex flex-col gap-6">
              <section>
                <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Map className="w-4 h-4 royce-icon-gold" />
                  <span className="elix-silver-red-text">Treasure Hunt</span>
                </h2>
                {chests.length === 0 ? (
                  <p className="text-xs">
                    <span className="elix-silver-red-text opacity-55">
                      No chests yet. Watch LIVE to find them.
                    </span>
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {chests.map((chest) => (
                      <li
                        key={chest.id}
                        className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 flex items-center justify-between gap-2"
                      >
                        <div>
                          <p className="text-sm">
                            <span className="elix-silver-red-text">{chest.title}</span>
                          </p>
                          <p className="text-[10px]">
                            <span className="elix-silver-red-text opacity-55">
                              {chest.rarity} · {chest.status}
                              {chest.reward_label ? ` · ${chest.reward_label}` : ""}
                            </span>
                          </p>
                        </div>
                        {chest.status === "found" ? (
                          <button
                            type="button"
                            disabled={view.openingChestId === chest.id}
                            onClick={() => void session.open(userId, chest.id)}
                            className="text-xs font-semibold px-2 py-1 rounded border border-white/30 bg-transparent disabled:opacity-40 active:opacity-70"
                          >
                            <span className="elix-silver-red-text">Open</span>
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Gift className="w-4 h-4 royce-icon-gold" />
                  <span className="elix-silver-red-text">Stickers</span>
                </h2>
                {sets.length === 0 ? (
                  <p className="text-xs">
                    <span className="elix-silver-red-text opacity-55">No sticker sets yet.</span>
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {sets.map((set) => (
                      <li key={set.id} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2">
                        <p className="text-sm">
                          <span className="elix-silver-red-text">{set.title}</span>
                        </p>
                        <p className="text-[10px]">
                          <span className="elix-silver-red-text opacity-55">
                            {set.progress}/{set.total}
                            {set.complete ? " · Complete" : ""}
                          </span>
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section>
                <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Star className="w-4 h-4 royce-icon-gold" />
                  <span className="elix-silver-red-text">Creator Cards</span>
                </h2>
                {cards.length === 0 ? (
                  <p className="text-xs">
                    <span className="elix-silver-red-text opacity-55">
                      Watch creators on LIVE to unlock cards.
                    </span>
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {cards.map((card) => (
                      <li
                        key={`${card.creator_id}-${card.tier}`}
                        className="rounded-xl border border-white/10 bg-black/40 px-3 py-2"
                      >
                        <p className="text-sm capitalize">
                          <span className="elix-silver-red-text">{card.tier} card</span>
                        </p>
                        <p className="text-[10px] truncate">
                          <span className="elix-silver-red-text opacity-55">{card.creator_id}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
