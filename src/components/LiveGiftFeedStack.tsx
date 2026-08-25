import { useEffect, useState } from "react";
import { wsClient } from "@/lib/wsClient";
import { LIVE_BATTLE_STAGE_BOTTOM, LIVE_SOLO_CHAT_TOP_FROM_BOTTOM } from "@/lib/profileFrame";
import { useAuthStore } from "@/store/useAuthStore";
import { isRecord } from "@/lib/isRecord";
import { GIFT_PILL_EVENT, type GiftPillDetail } from "./GiftAnimationOverlay";
import { AvatarRing } from "./AvatarRing";

type FeedCard = {
  id: string;
  username: string;
  giftIcon: string;
  giftName: string;
  quantity: number;
  avatar: string;
  timestamp: number;
};

const MERGE_MS = 8000;
const CLEAR_MS = 8000;
const MAX_CARDS = 3;

export function LiveGiftFeedStack({
  streamId,
  isBattleMode = false,
}: {
  streamId: string;
  isCohostMode?: boolean;
  isBattleMode?: boolean;
  cohostStageBottom?: string;
}) {
  const [stack, setStack] = useState<FeedCard[]>([]);

  useEffect(() => {
    const ingest = (raw: unknown) => {
      if (!isRecord(raw)) return;
      const eventStreamId = typeof raw.streamId === "string" ? raw.streamId : "";
      if (eventStreamId && eventStreamId !== streamId) return;
      const userId = typeof raw.userId === "string" ? raw.userId : "";
      if (userId && userId === useAuthStore.getState().user?.id) return;
      const username = typeof raw.username === "string" ? raw.username : "Someone";
      const giftName = typeof raw.giftName === "string" ? raw.giftName : "gift";
      const giftIcon = typeof raw.giftIcon === "string" ? raw.giftIcon : "";
      const avatar = typeof raw.avatar === "string" ? raw.avatar : "";
      const quantity = typeof raw.quantity === "number" && raw.quantity > 0 ? raw.quantity : 1;
      const now = Date.now();
      setStack((prev) => {
        const existing = prev.find((c) => c.username === username && c.giftName === giftName && now - c.timestamp < MERGE_MS);
        if (existing) {
          return prev.map((c) => (c.id === existing.id ? { ...c, quantity: c.quantity + quantity, timestamp: now } : c)).slice(0, MAX_CARDS);
        }
        return [{ id: `${now}`, username, giftIcon, giftName, quantity, avatar, timestamp: now }, ...prev].slice(0, MAX_CARDS);
      });
    };
    const onLocal = (ev: Event) => ingest((ev as CustomEvent<GiftPillDetail>).detail);
    wsClient.on("gift_sent", ingest);
    window.addEventListener(GIFT_PILL_EVENT, onLocal);
    const clear = window.setInterval(() => {
      const cutoff = Date.now() - CLEAR_MS;
      setStack((prev) => prev.filter((c) => c.timestamp > cutoff));
    }, 1000);
    return () => {
      wsClient.off("gift_sent", ingest);
      window.removeEventListener(GIFT_PILL_EVENT, onLocal);
      window.clearInterval(clear);
    };
  }, [streamId]);

  const card = stack[0];
  if (!card) return null;

  return (
    <div
      className="fixed left-2 z-[140] pointer-events-none"
      style={{
        bottom: isBattleMode ? undefined : `calc(${LIVE_SOLO_CHAT_TOP_FROM_BOTTOM} - 23mm)`,
        top: isBattleMode ? LIVE_BATTLE_STAGE_BOTTOM : undefined,
        transform: isBattleMode ? undefined : "translateY(-100%)",
        maxWidth: 220,
      }}
    >
      <div className="rounded-full bg-black/75 flex items-center gap-1.5 px-1.5 py-1">
        <AvatarRing src={card.avatar} alt={card.username} size={28} />
        <div className="min-w-0">
          <p className="text-white text-[10px] font-semibold truncate leading-tight">{card.username}</p>
          <p className="text-white/70 text-[9px] truncate leading-tight">sent {card.giftName}</p>
        </div>
        {card.giftIcon ? <img src={card.giftIcon} alt="" className="w-6 h-6 object-contain" /> : <span className="text-sm">🎁</span>}
        {card.quantity > 1 ? <span className="text-white text-[11px] font-black pr-1">x{card.quantity}</span> : null}
      </div>
    </div>
  );
}
