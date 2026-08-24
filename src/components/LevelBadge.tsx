import { useId } from "react";
import { AvatarRing } from "@/components/AvatarRing";
import { LEVEL_BADGE_PILL_PX, LEVEL_BADGE_RING_PX } from "@/lib/profileFrame";

function LevelDiamond({ size }: { size: number }) {
  const fillId = `lvl-dia-${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden style={{ display: "block", flexShrink: 0 }}>
      <path d="M22 10 H42 L54 26 L32 54 L10 26 Z" fill={`url(#${fillId})`} opacity={0.95} />
      <g stroke="#FFFFFF" strokeLinejoin="round" strokeLinecap="round" fill="none">
        <path d="M22 10 H42 L54 26 L32 54 L10 26 Z" strokeWidth="3.2" />
      </g>
      <g stroke="#E6E9EE" strokeLinejoin="round" strokeLinecap="round" fill="none">
        <path d="M22 10 H42 L54 26 L32 54 L10 26 Z" strokeWidth="2.1" />
        <path d="M10 26 H54" strokeWidth="2" />
        <path d="M22 10 L32 26" strokeWidth="1.9" />
        <path d="M42 10 L32 26" strokeWidth="1.9" />
        <path d="M32 10 L10 26" strokeWidth="1.8" />
        <path d="M32 10 L54 26" strokeWidth="1.8" />
        <path d="M21 26 L32 54" strokeWidth="1.9" />
        <path d="M43 26 L32 54" strokeWidth="1.9" />
      </g>
      <path d="M26 14 L38 14" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" opacity={0.95} />
      <defs>
        <linearGradient id={fillId} x1="18%" y1="8%" x2="82%" y2="92%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="42%" stopColor="#E6E9EE" />
          <stop offset="100%" stopColor="#E6E9EE" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function LevelBadge({
  level,
  circleSize,
  size,
  avatar,
  name,
  hideCircle = false,
  className = "",
}: {
  level: number;
  circleSize?: number;
  size?: number;
  avatar?: string | null;
  name?: string;
  hideCircle?: boolean;
  className?: string;
}) {
  const safeLevel = Number.isFinite(level) && level > 0 ? Math.floor(level) : 1;
  const ringPx =
    typeof circleSize === "number" && Number.isFinite(circleSize)
      ? Math.max(16, Math.floor(circleSize))
      : LEVEL_BADGE_RING_PX;
  const chipH =
    typeof size === "number" && Number.isFinite(size)
      ? Math.max(12, Math.floor(size))
      : LEVEL_BADGE_PILL_PX;
  const compact = chipH <= 18;
  const numberPx = Math.max(compact ? 8 : 10, Math.round(chipH * (compact ? 0.55 : 0.58)));
  const diamondSize = Math.max(compact ? 10 : 16, Math.round(chipH * (compact ? 0.72 : 0.95)));

  const chip = (
    <span
      className="inline-flex items-center justify-start flex-shrink-0"
      style={{
        height: chipH,
        minWidth: Math.round(diamondSize + numberPx * (compact ? 1.15 : 1.35) + (compact ? 4 : 10)),
        borderRadius: Math.round(chipH / 2),
        background: "linear-gradient(90deg, #3A3D44 0%, #2A2D33 100%)",
        border: "1px solid rgba(255,255,255,0.35)",
        paddingLeft: compact ? 1 : 2,
        paddingRight: compact ? 4 : 8,
      }}
    >
      <LevelDiamond size={diamondSize} />
      <span
        className="text-white font-black tabular-nums"
        style={{
          fontSize: numberPx,
          lineHeight: 1,
          letterSpacing: "0.01em",
          paddingLeft: compact ? 2 : 4,
        }}
      >
        {safeLevel}
      </span>
    </span>
  );

  if (hideCircle) {
    return <span className={`inline-flex items-center flex-shrink-0 ${className}`}>{chip}</span>;
  }

  return (
    <span className={`inline-flex items-center flex-shrink-0 ${className}`} style={{ gap: 4, height: Math.max(ringPx, chipH) }}>
      <AvatarRing src={avatar} alt={name || ""} size={ringPx} />
      {chip}
    </span>
  );
}
