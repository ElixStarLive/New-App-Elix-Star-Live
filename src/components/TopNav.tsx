import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, Tv } from "lucide-react";

const TABS = [
  { label: "LIVE", path: "/live", color: "#FF2D55", live: true },
  { label: "STEM", path: "/stem", color: "#A7ABB2" },
  { label: "Explore", path: "/discover", color: "#A7ABB2" },
  { label: "Following", path: "/following", color: "#A7ABB2" },
  { label: "Shop", path: "/shop", color: "#A7ABB2" },
  { label: "For You", path: "/feed", color: "#FFFFFF" },
] as const;

export const TopNav = () => {
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const sync = () => setProfileOpen(document.body.hasAttribute("data-user-profile-open"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-user-profile-open"] });
    return () => observer.disconnect();
  }, []);

  if (pathname !== "/feed" || profileOpen) return null;

  return (
    <div className="elix-home-top-bar fixed inset-x-0 top-0 z-[9999] flex justify-center pointer-events-none">
      <div
        className="feed-column-width pointer-events-auto bg-transparent min-h-[var(--topnav-bar-height)]"
        style={{
          paddingTop: "var(--safe-top)",
          minHeight: "calc(var(--safe-top) + var(--topnav-bar-height))",
        }}
      >
        <div className="flex items-center w-full px-1.5 gap-0.5 min-h-[var(--topnav-bar-height)] h-[var(--topnav-bar-height)]">
          <div className="flex flex-1 items-center justify-between min-w-0 h-full flex-nowrap overflow-x-auto no-scrollbar gap-0">
            {TABS.map((tab) => (
              <button
                key={tab.path}
                type="button"
                onClick={() => navigate(tab.path, tab.path === "/live" ? { replace: true } : undefined)}
                className="flex-shrink-0 flex items-center px-1 py-0 h-full active:opacity-70 transition-opacity focus:outline-none"
                style={{ WebkitTapHighlightColor: "transparent" }}
                title={tab.label}
                aria-label={tab.label}
              >
                <span className="flex items-center gap-0.5 whitespace-nowrap leading-none">
                  {"live" in tab && tab.live ? (
                    <Tv
                      size={11}
                      strokeWidth={2.25}
                      className="shrink-0 -translate-y-[0.5mm]"
                      style={{ color: tab.color, stroke: tab.color }}
                      aria-hidden
                    />
                  ) : null}
                  <span
                    className="text-[10px] font-bold tracking-wide"
                    style={{ backgroundImage: "none", WebkitTextFillColor: tab.color, color: tab.color }}
                  >
                    {tab.label}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => navigate("/search")}
            title="Search"
            className="flex-shrink-0 flex items-center justify-center w-6 h-full ml-0.5 active:opacity-70 transition-opacity"
            style={{ WebkitTapHighlightColor: "transparent" }}
            aria-label="Search"
          >
            <Search size={13} strokeWidth={2.25} style={{ color: "#E8EAED", stroke: "#E8EAED" }} />
          </button>
        </div>
      </div>
    </div>
  );
};
