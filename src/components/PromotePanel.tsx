import { useMemo, useState } from "react";
import { FileText, Heart, Play, UserPlus } from "lucide-react";
import { platform } from "@/lib/platform";
import { purchasePromoteBoost } from "@/features/promote/promotePurchase";
import { PROMOTE_PRODUCTS, type PromoteGoal, type PromoteProductId } from "@shared/contracts";

const GOAL_ROWS: Array<{
  goal: PromoteGoal;
  productId: PromoteProductId;
  label: string;
  Icon: typeof Heart;
  badge?: string;
  reach: string;
  reachHint: string;
}> = [
  { goal: "likes", productId: "com.elixstarlive.promote_likes", label: "More likes & comments", Icon: Heart, badge: "New", reach: "10 - 10K", reachHint: "likes & comments" },
  { goal: "views", productId: "com.elixstarlive.promote_views", label: "More video views", Icon: Play, reach: "5K - 500K", reachHint: "video views" },
  { goal: "followers", productId: "com.elixstarlive.promote_followers", label: "More followers", Icon: UserPlus, reach: "5K", reachHint: "followers" },
  { goal: "profile", productId: "com.elixstarlive.promote_profile", label: "More profile views", Icon: FileText, reach: "300 - 30K", reachHint: "profile views" },
];

export function PromotePanel({
  open,
  onClose,
  contentType,
  content,
}: {
  open: boolean;
  onClose: () => void;
  contentType: "video" | "profile" | "live";
  content: {
    id: string;
    title?: string;
    description?: string;
    thumbnail?: string | null;
    username?: string;
    postedAt?: string;
  };
}) {
  const [boostLive, setBoostLive] = useState(contentType === "live");
  const [goal, setGoal] = useState<PromoteGoal>("likes");
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const iosLiftMm = platform.isNative && platform.isIOS ? 6 : 0;

  const selected = GOAL_ROWS.find((row) => row.goal === goal) ?? GOAL_ROWS[0];
  const gbp = useMemo(() => {
    const pence = PROMOTE_PRODUCTS[selected.productId].amountPence;
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(pence / 100);
  }, [selected.productId]);
  const priceLabel = platform.isNative ? (platform.isIOS ? "via App Store" : "via Google Play") : gbp;
  const preview = content.title || content.description || `#${content.username || "content"}`;
  const posted = content.postedAt ? `Posted on ${content.postedAt}` : "Posted recently";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-[480px] elix-panel backdrop-blur-md rounded-t-2xl h-[38vh] max-h-[320px] overflow-hidden flex flex-col border border-black bottom-sheet-above-nav"
        style={
          iosLiftMm
            ? { height: `calc(38vh + ${iosLiftMm}mm)`, maxHeight: `calc(320px + ${iosLiftMm}mm)` }
            : undefined
        }
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>
        <div className="flex items-center justify-center px-3 py-1 border-b border-white/10 flex-shrink-0">
          <h2 className="text-white font-bold text-sm">Promote</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 min-h-0 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#E6E9EE]/50 [&::-webkit-scrollbar-thumb]:rounded-full">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setBoostLive(false)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
                !boostLive ? "bg-[#E6E9EE] text-white elix-accent" : "bg-white/5 text-white/70"
              }`}
            >
              Boost account
            </button>
            {contentType === "live" ? (
              <button
                type="button"
                onClick={() => setBoostLive(true)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
                  boostLive ? "bg-[#E6E9EE] text-white elix-accent" : "bg-white/5 text-white/70"
                }`}
              >
                Boost LIVE
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {GOAL_ROWS.map((row) => (
              <button
                key={row.goal}
                type="button"
                onClick={() => setGoal(row.goal)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-left ${
                  goal === row.goal ? "bg-white/10 border border-[#D8D9DD]/40" : "bg-white/5"
                }`}
              >
                <row.Icon size={16} className="text-[#F5F5F7] flex-shrink-0" />
                <span className="text-white text-xs font-medium flex-1 truncate">{row.label}</span>
                {row.badge ? (
                  <span className="text-[8px] font-bold text-[#F5F5F7] bg-white/10 px-1.5 py-0.5 rounded">{row.badge}</span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/5">
            <div className="w-9 h-9 rounded-lg overflow-hidden bg-[rgba(0,0,0,0.35)] flex-shrink-0">
              {content.thumbnail ? (
                <img src={content.thumbnail} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Play size={14} className="text-white/40" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate" data-elix-promote-video={content.id}>
                {preview}
              </p>
              <p className="text-white/50 text-[10px]">{posted}</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[#F5F5F7] text-lg font-bold">{selected.reach}</p>
              <p className="text-white/50 text-[10px]">{selected.reachHint}</p>
            </div>
            <label className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/5 shrink-0">
              <span className="text-white text-[10px]">Default audience</span>
              <input type="radio" name="audience" checked readOnly className="w-4 h-4 accent-[#FFFFFF]" />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between px-3 py-2 border-t border-white/10 bg-[rgba(0,0,0,0.35)] flex-shrink-0">
          <div>
            {message ? (
              <p className="text-white/60 text-xs max-w-[200px]">{message}</p>
            ) : (
              <>
                <p className="text-white font-bold text-base">{priceLabel}</p>
                <button type="button" className="text-white/50 text-[10px] underline" onClick={() => setMessage(`Price: ${priceLabel}`)}>
                  See price details
                </button>
              </>
            )}
          </div>
          <button
            type="button"
            disabled={paying}
            className="px-5 py-2 rounded-lg bg-[#E6E9EE] text-white elix-accent font-bold text-xs active:scale-95 disabled:opacity-70"
            style={platform.isNative && platform.isIOS ? { marginBottom: "3mm", alignSelf: "flex-end" } : undefined}
            onClick={() => {
              setMessage(null);
              setPaying(true);
              void purchasePromoteBoost({
                productId: selected.productId,
                contentType: boostLive && contentType === "live" ? "live" : contentType,
                contentId: content.id,
              }).then((result) => {
                setPaying(false);
                if (result.ok) {
                  onClose();
                  return;
                }
                if (!result.cancelled) setMessage(result.error);
              });
            }}
          >
            {paying ? "..." : "Pay"}
          </button>
        </div>
      </div>
    </div>
  );
}
