import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, Tv } from "lucide-react";

const TOP_TABS = [
  { label: "LIVE", path: "/live", live: true },
  { label: "STEM", path: "/stem" },
  { label: "Explore", path: "/discover" },
  { label: "Following", path: "/following" },
  { label: "Shop", path: "/shop" },
  { label: "For You", path: "/feed", primary: true },
] as const;

type TopTabPath = (typeof TOP_TABS)[number]["path"];

export const TopNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [userProfileOpen, setUserProfileOpen] = useState(false);

  useEffect(() => {
    const sync = () => setUserProfileOpen(document.body.hasAttribute("data-user-profile-open"));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.body, { attributes: true, attributeFilter: ["data-user-profile-open"] });
    return () => mo.disconnect();
  }, []);

  const onTabPress = useCallback(
    (path: TopTabPath) => {
      if (path === "/live") {
        if (location.pathname === "/live") return;
        navigate("/live", { replace: true });
        return;
      }
      if (location.pathname === path) return;
      navigate(path);
    },
    [navigate, location.pathname],
  );

  if (location.pathname !== "/feed") return null;
  if (userProfileOpen) return null;

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
            {TOP_TABS.map((tab) => {
              const isPrimary = "primary" in tab && tab.primary;
              const isLive = "live" in tab && tab.live;
              const labelColor = isLive ? "#FF2D55" : isPrimary ? "#FFFFFF" : "#A7ABB2";
              return (
                <button
                  key={tab.label}
                  type="button"
                  onClick={() => onTabPress(tab.path)}
                  className="flex-shrink-0 flex items-center px-1 py-0 h-full active:opacity-70 transition-opacity focus:outline-none"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                  title={tab.label}
                  aria-label={tab.label}
                >
                  <span className="flex items-center gap-0.5 whitespace-nowrap leading-none">
                    {isLive ? (
                      <Tv
                        size={11}
                        strokeWidth={2.25}
                        className="shrink-0 -translate-y-[0.5mm]"
                        style={{ color: "#FF2D55", stroke: "#FF2D55" }}
                        aria-hidden
                      />
                    ) : null}
                    <span
                      className="text-[10px] font-bold tracking-wide"
                      style={{
                        backgroundImage: "none",
                        WebkitTextFillColor: labelColor,
                        color: labelColor,
                      }}
                    >
                      {tab.label}
                    </span>
                  </span>
                </button>
              );
            })}
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
