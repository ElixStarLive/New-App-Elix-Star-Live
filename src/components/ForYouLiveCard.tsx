import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { LiveStreamCard } from "@shared/contracts";
import { AvatarRing } from "@/components/AvatarRing";
import { formatCompactNumber } from "@/lib/formatCompactNumber";

const navStackExpr = "var(--nav-height) + var(--safe-bottom)";

export function ForYouLiveCard({
  stream,
  isActive: _isActive,
}: {
  stream: LiveStreamCard;
  isActive: boolean;
}) {
  const navigate = useNavigate();
  const [tapped, setTapped] = useState(false);
  const watchId = stream.streamId || stream.roomId;

  useEffect(() => {
    setTapped(false);
  }, [watchId]);

  return (
    <button
      type="button"
      className="relative w-full h-full overflow-hidden bg-[#080A0E] text-left"
      onClick={() => {
        if (tapped) return;
        setTapped(true);
        navigate(`/watch/${encodeURIComponent(watchId)}`);
      }}
      aria-label={`Watch ${stream.displayName} live`}
    >
      {stream.avatarUrl ? (
        <img src={stream.avatarUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" />
      ) : (
        <div className="absolute inset-0 bg-[#080A0E]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
      <span className="absolute top-24 left-3 z-[10] text-[10px] font-black text-[#FF2D55]">LIVE</span>
      <div className="absolute inset-0 flex flex-col items-center justify-center z-[5] pointer-events-none">
        <AvatarRing src={stream.avatarUrl} alt={stream.displayName} size={96} ringColor="#FF2D55" />
      </div>
      <div
        className="absolute z-[10] left-3 right-3 pointer-events-none"
        style={{ bottom: `calc(${navStackExpr} + 5mm + 3px + 2mm)` }}
      >
        <p className="elix-silver-red-text font-bold truncate">{stream.displayName || stream.username}</p>
        <p className="elix-silver-red-text text-xs opacity-80">{formatCompactNumber(stream.viewerCount)} watching</p>
        {stream.title ? <p className="elix-silver-red-text text-sm line-clamp-2">{stream.title}</p> : null}
      </div>
    </button>
  );
}
