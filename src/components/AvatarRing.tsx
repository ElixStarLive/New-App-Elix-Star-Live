import { cn } from "@/lib/cn";
import { realAvatarUrl } from "@/lib/avatarUrl";

export function AvatarRing({
  src,
  alt,
  size,
  ringColor,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  size: number;
  ringColor?: string;
  className?: string;
}) {
  const ring = ringColor || "#D8D9DD";
  const photo = realAvatarUrl(src);
  const safeSize = typeof size === "number" && Number.isFinite(size) && size > 0 ? Math.floor(size) : 40;
  return (
    <span
      className={cn("elix-profile-ring relative inline-flex rounded-full overflow-hidden bg-[#121419] shrink-0", className)}
      style={{
        width: safeSize,
        height: safeSize,
        boxSizing: "border-box",
        border: `1px solid ${ring}`,
        boxShadow: "none",
      }}
    >
      {photo ? <img src={photo} alt={alt} className="block w-full h-full object-cover object-center" draggable={false} /> : null}
    </span>
  );
}
