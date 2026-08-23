import type { LucideIcon } from "lucide-react";
import { ChevronLeft, ShoppingBasket } from "lucide-react";

const DISC = "royce-glow-disc";
const GLYPH = 18;

export function RoyceIcon({
  icon: Icon,
  size = GLYPH,
  tile = true,
  className = "",
}: {
  icon: LucideIcon;
  size?: number;
  tile?: boolean;
  className?: string;
}) {
  const glyph = Math.min(size > 0 ? size : GLYPH, GLYPH);
  const mark = <Icon size={glyph} strokeWidth={2.25} className="royce-icon-gold" aria-hidden />;
  if (!tile) return <span className={`inline-flex items-center justify-center ${className}`}>{mark}</span>;
  return (
    <span className={`${DISC} ${className}`} aria-hidden>
      {mark}
    </span>
  );
}

export function RoyceBackIcon({ className = "" }: { className?: string }) {
  return (
    <span className={`${DISC} ${className}`} aria-hidden>
      <ChevronLeft size={GLYPH} strokeWidth={2.35} className="royce-icon-gold block" />
    </span>
  );
}

export function RoyceCloseIcon({ className = "" }: { className?: string }) {
  return <RoyceBackIcon className={className} />;
}

export function ShopBasketIcon({
  size = 16,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return <ShoppingBasket size={size} strokeWidth={2.25} className={className} aria-hidden />;
}
