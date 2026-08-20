import React from "react";
import { Heart } from "lucide-react";
import { AvatarRing } from "./AvatarRing";
import { LIVE_TOP_AVATAR_RING_PX } from "@/lib/profileFrame";

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
                <Heart className="elix-join-heart w-3.5 h-3.5" strokeWidth={2.2} />
                <span className="text-[11px] font-semibold">Join</span>
              </button>
            </div>
            <span className="elix-silver-red-text text-[9px] font-semibold">{likes} Likes LIVE</span>
          </div>
        </div>
      </div>
    </div>
  );
}
