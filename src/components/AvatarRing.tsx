import { cn } from "@/lib/cn";

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
  return (
    <span
      className={cn("inline-flex rounded-full overflow-hidden bg-[#121419] shrink-0", className)}
      style={{ width: size, height: size, boxShadow: `0 0 0 1px ${ring}` }}
    >
      {src ? (
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <span className="w-full h-full flex items-center justify-center text-white/70 text-[10px] font-bold">
          {(alt || "U").slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}
