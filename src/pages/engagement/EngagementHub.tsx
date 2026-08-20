import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Calendar, ChevronRight, Crown, Gift, Star, Target, Trophy, Wallet, Zap } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import { useWalletStore } from "@/store/useWalletStore";
import { PageScaffold } from "@/components/PageScaffold";
import { SETTINGS_HOME, containerReturnState, exitToFromLocationState, returnToFromLocationState } from "@/lib/settingsNav";

const LINKS = [
  { path: "/engagement/missions", title: "Missions", subtitle: "Daily & weekly goals", Icon: Target },
  { path: "/engagement/fan-level", title: "Fan Level", subtitle: "XP and fan tiers", Icon: Star },
  { path: "/engagement/mvp", title: "MVP Leaderboard", subtitle: "Today & this week", Icon: Crown },
  { path: "/engagement/achievements", title: "Achievements", subtitle: "Permanent unlocks", Icon: Trophy },
  { path: "/engagement/rewards", title: "Reward Wallet", subtitle: "Purchased, promo, energy, XP", Icon: Wallet },
  { path: "/engagement/daily-login", title: "Daily Login", subtitle: "7-day streak rewards", Icon: Calendar },
  { path: "/engagement/collections", title: "Collections", subtitle: "Treasure, stickers, creator cards", Icon: Zap },
] as const;

export default function EngagementHub() {
  const navigate = useNavigate();
  const location = useLocation();
  const promo = useWalletStore((s) => s.promoCoins);
  const fetchWallet = useWalletStore((s) => s.fetchWallet);
  const [levelLine, setLevelLine] = useState("Fan");
  const [xp, setXp] = useState(0);
  const childReturnState = containerReturnState(returnToFromLocationState(location.state) || "/engagement");

  useEffect(() => {
    void fetchWallet();
    void apiRequest<unknown>("/api/engagement/fan-level").then((res) => {
      if (res.error || !isRecord(res.data) || !Array.isArray(res.data.items)) return;
      const first = res.data.items[0];
      if (!isRecord(first)) return;
      if (typeof first.title === "string") setLevelLine(first.title);
      const detail = typeof first.detail === "string" ? first.detail : "";
      const n = Number.parseInt(detail, 10);
      if (Number.isFinite(n)) setXp(n);
    });
  }, [fetchWallet]);

  return (
    <PageScaffold title="Engagement Hub" onClose={() => navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true })}>
      <div className="px-3 pt-2 pb-[3mm]">
        <div className="px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-[0.12em] text-[#8B9099] mb-2">{levelLine}</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[10px] text-[#8B9099]">Promo</div>
              <div className="text-sm font-bold tabular-nums text-[#E6E9EE]">{promo}</div>
            </div>
            <div>
              <div className="text-[10px] text-[#8B9099] flex items-center justify-center gap-0.5">
                <Zap className="w-3 h-3 royce-icon-gold" /> Energy
              </div>
              <div className="text-sm font-bold tabular-nums text-[#E6E9EE]">0</div>
            </div>
            <div>
              <div className="text-[10px] text-[#8B9099]">XP</div>
              <div className="text-sm font-bold tabular-nums text-[#E6E9EE]">{xp}</div>
            </div>
          </div>
        </div>
        {LINKS.map(({ path, title, subtitle, Icon }) => (
          <button
            key={path}
            type="button"
            onClick={() => navigate(path, { state: childReturnState })}
            className="w-full flex items-center gap-3 px-2.5 py-2.5 active:bg-white/5 text-left rounded-md"
          >
            <span className="royce-glow-disc shrink-0" style={{ width: 36, height: 36 }}>
              <Icon size={16} className="royce-icon-gold" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] text-[#E6E9EE]">{title}</span>
              <span className="block text-[11px] text-[#8B9099]">{subtitle}</span>
            </span>
            <ChevronRight size={16} className="text-white/30 shrink-0" />
          </button>
        ))}
        <button type="button" onClick={() => navigate("/purchase-coins", { state: childReturnState })} className="w-full flex items-center gap-3 px-2.5 py-2.5 text-left rounded-md">
          <span className="royce-glow-disc shrink-0" style={{ width: 36, height: 36 }}>
            <Gift size={16} className="royce-icon-gold" />
          </span>
          <span className="flex-1 text-[15px] text-[#E6E9EE]">Get coins</span>
          <ChevronRight size={16} className="text-white/30 shrink-0" />
        </button>
      </div>
    </PageScaffold>
  );
}
