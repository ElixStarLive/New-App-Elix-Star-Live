import { useEffect, useState } from "react";

export function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const onToast = (ev: Event) => {
      const detail = (ev as CustomEvent<{ message?: string }>).detail;
      if (detail?.message) setMessage(detail.message);
    };
    window.addEventListener("elix-toast", onToast);
    return () => window.removeEventListener("elix-toast", onToast);
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => setMessage(null), 2800);
    return () => window.clearTimeout(t);
  }, [message]);

  if (!message) return null;

  return (
    <div className="fixed left-0 right-0 z-[10050] flex justify-center pointer-events-none" style={{ top: "calc(var(--safe-top) + 48px)" }}>
      <div className="pointer-events-auto rounded-full bg-black/80 border border-[#D8D9DD]/30 text-white px-4 py-2 text-xs">
        {message}
      </div>
    </div>
  );
}
