import React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function PageScaffold({
  title,
  onClose,
  children,
  className,
  left,
  headerBorder = true,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  left?: React.ReactNode;
  headerBorder?: boolean;
}) {
  return (
    <div className="page-above-bottom-nav min-h-full h-full">
      <div className={cn("page-above-bottom-nav__inner elix-settings-write min-h-full flex flex-col", className)}>
        <header
          className={cn(
            "relative flex items-center justify-between px-4 pb-2",
            headerBorder ? "border-b border-[#D8D9DD]/45" : "",
          )}
          style={{ paddingTop: "var(--page-header-top)" }}
        >
          <div className="z-10 min-w-[40px]">{left ?? <span className="w-10 h-10 block" />}</div>
          <h1 className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[16px] font-bold text-white">
            {title}
          </h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="relative z-20 p-1"
          >
            <X size={18} className="text-[#E6E9EE]" />
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
