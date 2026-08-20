
export function CaptureShutterButton({
  size = 72,
  recording = false,
  className = "",
}: {
  size?: number;
  recording?: boolean;
  className?: string;
}) {
  const ringPx = Math.max(3, Math.round(size * 0.06));
  const inner = recording ? Math.round(size * 0.34) : Math.round(size * 0.7);

  return (
    <span
      className={`capture-shutter-ring relative inline-flex items-center justify-center rounded-full box-border flex-shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        border: "none",
        background: "transparent",
        ["--shutter-ring" as string]: `${ringPx}px`,
      }}
      aria-hidden
    >
      <span
        className={recording ? "rounded-[4px] bg-[#E6E9EE]" : "rounded-full bg-[#E6E9EE]"}
        style={{ width: inner, height: inner, position: "relative", zIndex: 1 }}
      />
    </span>
  );
}
