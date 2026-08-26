import { realAvatarUrl } from "@/lib/avatarUrl";

const SILVER_RING = "#D8D9DD";
const LIVE_RING = "#FF2D55";

export function StoryGoldRingAvatar({
  size = 56,
  src,
  alt = "",
  live = false,
  className = "",
  "data-avatar-circle": dataAvatarCircle,
}: {
  size?: number;
  src: string;
  alt?: string;
  live?: boolean;
  className?: string;
  "data-avatar-circle"?: string;
}) {
  const box = typeof size === "number" && Number.isFinite(size) && size > 0 ? Math.floor(size) : 56;
  const photo = realAvatarUrl(src);
  const ring = live ? LIVE_RING : SILVER_RING;

  return (
    <div
      className={`relative flex-shrink-0 ${className}`}
      style={{ width: box, height: box }}
      {...(dataAvatarCircle ? { "data-avatar-circle": dataAvatarCircle } : {})}
    >
      <div
        className={`elix-profile-ring absolute inset-0 rounded-full overflow-hidden ${live ? "elix-story-live-ring" : ""}`}
        style={{ boxSizing: "border-box", border: `1px solid ${ring}`, background: "#121419" }}
      >
        {photo ? (
          <img src={photo} alt={alt} className="block w-full h-full object-cover object-center" draggable={false} />
        ) : null}
      </div>
      {live ? (
        <div
          className="pointer-events-none absolute bottom-0 left-1/2 z-[20] -translate-x-1/2 translate-y-1/2 whitespace-nowrap font-bold leading-none"
          style={{
            backgroundColor: LIVE_RING,
            color: "#FFFFFF",
            fontSize: Math.max(5, Math.round(box * 0.11)),
            padding: `${Math.max(1, Math.round(box * 0.02))}px ${Math.max(3, Math.round(box * 0.08))}px`,
            borderRadius: Math.max(2, Math.round(box * 0.055)),
          }}
        >
          LIVE
        </div>
      ) : null}
    </div>
  );
}
