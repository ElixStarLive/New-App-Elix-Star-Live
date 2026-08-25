import { useEffect, useRef, useState } from "react";
import { wsClient } from "@/lib/wsClient";
import { useAuthStore } from "@/store/useAuthStore";
import { isRecord } from "@/lib/isRecord";

export const GIFT_PILL_EVENT = "gift-pill";

export type GiftPillDetail = {
  username?: string;
  giftName?: string;
  giftIcon?: string;
  avatar?: string;
  quantity?: number;
  creatorName?: string;
  streamId?: string;
  userId?: string;
};

export function pushLocalGiftPill(detail: GiftPillDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GIFT_PILL_EVENT, { detail }));
}

type GiftAnimation = {
  id: string;
  username: string;
  giftIcon: string;
  giftName: string;
  creatorName: string;
  quantity: number;
  timestamp: number;
};

const MERGE_WINDOW_MS = 2000;
const DISPLAY_DURATION_MS = 4000;

function readGiftDetail(data: unknown): GiftPillDetail | null {
  if (!isRecord(data)) return null;
  return {
    username: typeof data.username === "string" ? data.username : undefined,
    giftName: typeof data.giftName === "string" ? data.giftName : undefined,
    giftIcon: typeof data.giftIcon === "string" ? data.giftIcon : undefined,
    avatar: typeof data.avatar === "string" ? data.avatar : undefined,
    quantity: typeof data.quantity === "number" ? data.quantity : 1,
    creatorName: typeof data.creatorName === "string" ? data.creatorName : undefined,
    streamId: typeof data.streamId === "string" ? data.streamId : undefined,
    userId: typeof data.userId === "string" ? data.userId : undefined,
  };
}

export default function GiftAnimationOverlay({ streamId }: { streamId: string; isBattleMode?: boolean }) {
  const [currentGift, setCurrentGift] = useState<GiftAnimation | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamIdRef = useRef(streamId);
  streamIdRef.current = streamId;

  const ingest = (raw: unknown) => {
    const data = readGiftDetail(raw);
    if (!data) return;
    if (data.streamId && data.streamId !== streamIdRef.current) return;
    if (data.userId && data.userId === useAuthStore.getState().user?.id) return;
    const username = data.username || "Someone";
    const giftName = data.giftName || "gift";
    const quantity = data.quantity && data.quantity > 0 ? data.quantity : 1;
    const now = Date.now();
    setCurrentGift((prev) => {
      if (prev && prev.username === username && prev.giftName === giftName && now - prev.timestamp < MERGE_WINDOW_MS) {
        return { ...prev, quantity: prev.quantity + quantity, timestamp: now };
      }
      return {
        id: `${now}`,
        username,
        giftIcon: data.giftIcon || "",
        giftName,
        creatorName: data.creatorName || "Creator",
        quantity,
        timestamp: now,
      };
    });
  };

  useEffect(() => {
    const onWs = (data: unknown) => ingest(data);
    const onLocal = (ev: Event) => ingest((ev as CustomEvent<GiftPillDetail>).detail);
    wsClient.on("gift_sent", onWs);
    window.addEventListener(GIFT_PILL_EVENT, onLocal);
    return () => {
      wsClient.off("gift_sent", onWs);
      window.removeEventListener(GIFT_PILL_EVENT, onLocal);
    };
  }, []);

  useEffect(() => {
    if (!currentGift) return;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setCurrentGift(null), DISPLAY_DURATION_MS);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [currentGift]);

  return (
    <div className="fixed inset-0 pointer-events-none z-[999996] flex justify-center">
      <div className="w-full max-w-[480px] relative">
        <div className="absolute left-0 right-0" style={{ top: "calc(env(safe-area-inset-top, 0px) + 66px + 0.5mm)" }}>
          {currentGift && (
            <div className="animate-slide-in-right w-full rounded-full flex items-center gap-1.5 overflow-hidden px-2 py-0.5 bg-red-600/85 backdrop-blur-sm">
              <div className="w-4 h-4 flex-shrink-0">
                {currentGift.giftIcon && (currentGift.giftIcon.startsWith("http") || currentGift.giftIcon.startsWith("/")) ? (
                  <img src={currentGift.giftIcon} alt="" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-xs">{currentGift.giftIcon || "🎁"}</span>
                )}
              </div>
              <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
                <p className="text-xs font-bold text-black whitespace-nowrap leading-tight">
                  {currentGift.username} sent {currentGift.giftName} to {currentGift.creatorName}
                  {currentGift.quantity > 1 ? <span> x{currentGift.quantity}</span> : null}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
