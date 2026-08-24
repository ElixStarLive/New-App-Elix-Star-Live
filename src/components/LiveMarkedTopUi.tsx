import React from "react";
import { Heart } from "lucide-react";
import { AvatarRing } from "./AvatarRing";
import { LIVE_TOP_AVATAR_RING_PX } from "@/lib/profileFrame";

function formatLikesShort(count: number): string {
  const value = Number.isFinite(count) ? count : 0;
  if (value >= 1_000_000) {
    const millions = Math.round((value / 1_000_000) * 10) / 10;
    return `${Number.isInteger(millions) ? Math.trunc(millions) : millions}M`;
  }
  if (value >= 1000) {
    const thousands = Math.round((value / 1000) * 10) / 10;
    return `${Number.isInteger(thousands) ? Math.trunc(thousands) : thousands}K`;
  }
  return String(value);
}

const ACTION_PILL_CLASS =
  "flex items-center justify-center gap-1 w-[70px] h-[36px] pl-2 pr-2.5 rounded-full box-border flex-shrink-0 active:scale-95 transition-transform";

function LiveHostTruncatedName({ name }: { name: string }) {
  const textRef = React.useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = React.useState(false);
  React.useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    setTruncated(el.scrollWidth > el.clientWidth + 1);
  }, [name]);
  return (
    <span data-elix-profile-name="true" className="inline-flex items-baseline min-w-0" style={{ maxWidth: "calc(64px + 3mm)" }} title={name}>
      <span ref={textRef} className="elix-live-name-text elix-silver-red-text text-[12px] font-bold leading-tight min-w-0 overflow-hidden whitespace-nowrap">
        {name}
      </span>
      {truncated ? (
        <span className="elix-live-name-dots elix-silver-red-text text-[12px] font-bold leading-tight flex-shrink-0" aria-hidden>
          ...
        </span>
      ) : null}
    </span>
  );
}

export function LiveHostProfileHeader({
  name,
  avatar,
  likes,
  showFollow,
  isFollowing,
  onAvatarClick,
  onFollow,
  onJoin,
  onLikesClick,
  joinSent,
}: {
  name: string;
  avatar: string | null;
  likes: number;
  showFollow: boolean;
  isFollowing: boolean;
  onAvatarClick: () => void;
  onFollow: (e: React.MouseEvent) => void;
  onJoin: () => void;
  onLikesClick?: () => void;
  joinSent: boolean;
}) {
  const followAboveJoin = Boolean(showFollow && !isFollowing);

  return (
    <div
      className="elix-live-follow-join-lock relative w-max max-w-full pointer-events-auto overflow-visible"
      style={{ left: "-7mm", transform: "translateX(2mm)" }}
    >
      {followAboveJoin ? (
        <button
          type="button"
          data-elix-follow="true"
          className={`elix-solid-red ${ACTION_PILL_CLASS} border border-[#EF4444] bg-[#EF4444]`}
          onClick={onFollow}
          aria-label="Follow"
        >
          <span className="text-white text-[13px] font-semibold leading-none whitespace-nowrap">Follow</span>
        </button>
      ) : null}
      <div
        className="elix-live-host-oval flex items-center gap-1.5 min-w-0 w-max max-w-full pointer-events-auto rounded-full pl-[2px] pr-2 py-[2px]"
        style={{
          minHeight: LIVE_TOP_AVATAR_RING_PX + 4,
          paddingRight: "calc(8px + 3mm)",
          position: "relative",
          clipPath: "inset(0 0 0 3mm round 9999px)",
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0 w-max max-w-full" style={{ position: "relative", left: "3mm" }}>
          <button type="button" data-elix-profile-ring="true" className="relative flex-shrink-0 rounded-full" onClick={onAvatarClick} aria-label="Open profile">
            <AvatarRing src={avatar} alt={name} size={LIVE_TOP_AVATAR_RING_PX} />
          </button>
          <div className="flex flex-col justify-center min-w-0 gap-[2px] pr-0.5">
            <div className="flex items-center gap-1 min-w-0 overflow-visible">
              <LiveHostTruncatedName name={name} />
              <button
                type="button"
                data-elix-join="true"
                data-elix-join-sent={joinSent ? "true" : "false"}
                className="elix-live-join-capsule flex items-center justify-center gap-1"
                onClick={onJoin}
                aria-label="Join"
              >
                <span className="relative inline-flex items-center justify-center w-[18px] h-[18px] flex-shrink-0">
                  <Heart className="elix-join-heart w-[18px] h-[18px]" strokeWidth={2.2} />
                  {!joinSent ? (
                    <span
                      className="absolute inset-0 flex items-center justify-center text-[9px] font-black leading-none pt-px"
                      style={{ color: "var(--elix-join-accent)" }}
                    >
                      +
                    </span>
                  ) : null}
                </span>
                <span className="text-[13px] font-semibold leading-none">Join</span>
              </button>
            </div>
            <button
              type="button"
              className="elix-silver-red-text text-[9px] font-semibold text-left"
              onClick={onLikesClick}
            >
              {formatLikesShort(likes)} Likes LIVE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const THIN_CAPSULE_CLASS =
  "elix-live-thin-capsule inline-flex items-center gap-0.5 flex-shrink-0 rounded-full pl-1.5 pr-2 h-[22px] box-border pointer-events-auto active:scale-95 transition-transform bg-transparent shadow-none";
const THIN_CAPSULE_STYLE: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #2A2D33",
  boxShadow: "none",
};
const CAPSULE_TITLE = "elix-silver-red-text text-[8px] font-bold whitespace-nowrap";
const CAPSULE_SUB = "elix-silver-red-text text-[6px] font-semibold whitespace-nowrap mt-[0.5px]";

export function LiveMarkedSubHeaderBar({
  rank,
  giftLabel,
  onWeeklyRanking,
  onDiamond,
  onGiftGoal,
  onExplore,
}: {
  rank: number | null;
  giftLabel?: string;
  onWeeklyRanking: () => void;
  onDiamond: () => void;
  onGiftGoal: () => void;
  onExplore: () => void;
}) {
  return (
    <div className="mt-1 -translate-y-[0.5mm] w-full pointer-events-auto relative z-20 flex justify-end">
      <div className="flex items-center gap-1.5 flex-nowrap w-max max-w-full ml-auto overflow-x-auto no-scrollbar">
        <button type="button" className={THIN_CAPSULE_CLASS} style={THIN_CAPSULE_STYLE} onClick={onWeeklyRanking}>
          <span className="text-[8px] leading-none w-[9px] h-[9px] flex items-center justify-center flex-shrink-0" aria-hidden>
            🔥
          </span>
          <span className="flex flex-col items-start justify-center leading-none min-w-0">
            <span className={CAPSULE_TITLE}>Weekly Ranking</span>
            <span className={CAPSULE_SUB}>{rank != null ? `No.${rank}` : "No."}</span>
          </span>
        </button>
        <button type="button" className={THIN_CAPSULE_CLASS} style={THIN_CAPSULE_STYLE} onClick={onDiamond}>
          <span className="w-[9px] h-[9px] rounded-[2px] rotate-45 bg-[#818CF8] flex-shrink-0" aria-hidden />
          <span className="flex flex-col items-start justify-center leading-none min-w-0">
            <span className={CAPSULE_TITLE}>Diamond League</span>
            <span className={CAPSULE_SUB}>{rank != null ? `Rank ${rank}` : "Rank"}</span>
          </span>
        </button>
        <button type="button" className={THIN_CAPSULE_CLASS} style={THIN_CAPSULE_STYLE} onClick={onGiftGoal} aria-label="Gift Goal">
          <span className="text-[8px] leading-none flex-shrink-0" aria-hidden>
            🎯
          </span>
          <span className="flex flex-col items-start justify-center leading-none min-w-0">
            <span className={CAPSULE_TITLE}>Gift Goal</span>
            <span className={CAPSULE_SUB}>{giftLabel || "Set"}</span>
          </span>
        </button>
        <button type="button" className={THIN_CAPSULE_CLASS} style={THIN_CAPSULE_STYLE} onClick={onExplore}>
          <span className="w-[9px] h-[9px] rounded-full bg-[#A5B4FC] flex-shrink-0" aria-hidden />
          <span className="flex flex-col items-start justify-center leading-none min-w-0">
            <span className={CAPSULE_TITLE}>Explore</span>
            <span className={CAPSULE_SUB}>Live</span>
          </span>
        </button>
      </div>
    </div>
  );
}
