import { CHAT_LEVEL_PILL_SIZE_PX } from "@/lib/profileFrame";

export function LevelBadge({
  level,
  circleSize = 30,
  size = 16,
}: {
  level: number;
  circleSize?: number;
  size?: number;
}) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full border border-[#D8D9DD]/50 text-[#E6E9EE] font-bold"
      style={{
        width: circleSize,
        height: Math.min(CHAT_LEVEL_PILL_SIZE_PX, circleSize),
        fontSize: size * 0.55,
      }}
    >
      {Math.max(0, Math.floor(level))}
    </span>
  );
}
