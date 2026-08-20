import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Users, Plus, MessageCircle, User, type LucideIcon } from "lucide-react";

type NavItem = {
  path: string;
  label: string;
  Icon: LucideIcon;
  center?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { path: "/feed", label: "Home", Icon: Home },
  { path: "/friends", label: "Friends", Icon: Users },
  { path: "/create", label: "Create", Icon: Plus, center: true },
  { path: "/inbox", label: "Inbox", Icon: MessageCircle },
  { path: "/profile", label: "Profile", Icon: User },
];

type BottomNavPath = (typeof NAV_ITEMS)[number]["path"];

const ICON_SIZE = 26;
const NAV_PADDING_BOTTOM =
  "max(2px, calc(env(safe-area-inset-bottom, 0px) - var(--bottom-nav-drop, 0mm)))";

function isActiveRoute(pathname: string, path: string): boolean {
  if (path === "/feed") return pathname === "/feed" || pathname === "/";
  if (path === "/profile") return pathname === "/profile" || pathname.startsWith("/profile/");
  return pathname === path || pathname.startsWith(`${path}/`);
}

export const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const onTabPress = useCallback(
    (path: BottomNavPath) => {
      if (path === "/feed") {
        if (location.pathname === "/feed" || location.pathname === "/") return;
      } else if (location.pathname === path) {
        return;
      }
      navigate(path);
    },
    [navigate, location.pathname],
  );

  if (location.pathname === "/live" || location.pathname.startsWith("/live/")) {
    return null;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[10002] pointer-events-none bg-transparent"
      aria-label="Main navigation"
    >
      <div className="flex justify-center pointer-events-none">
        <div className="feed-column-width pointer-events-auto bg-transparent border-0 border-b-0">
          <div
            className="flex items-center justify-around px-1 pt-1.5"
            style={{ paddingBottom: NAV_PADDING_BOTTOM }}
          >
            {NAV_ITEMS.map(({ path, label, Icon, center }) => {
              const active = isActiveRoute(location.pathname, path);
              const iconColor = active ? "#FFFFFF" : "#C8CDD5";
              return (
                <button
                  key={path}
                  type="button"
                  onClick={() => onTabPress(path)}
                  title={label}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  className="flex flex-col items-center justify-center flex-1 min-w-0 gap-0.5 active:opacity-75 transition-opacity"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                >
                  <span className="royce-glow-disc" aria-hidden>
                    {center ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="relative z-[2] block" aria-hidden>
                        <path
                          d="M12 5v14M5 12h14"
                          stroke="#E8EAED"
                          strokeWidth="2.75"
                          strokeLinecap="round"
                        />
                      </svg>
                    ) : (
                      <Icon
                        size={ICON_SIZE}
                        strokeWidth={active ? 2.35 : 2}
                        className="relative z-[2]"
                        style={{ color: iconColor, stroke: iconColor }}
                      />
                    )}
                  </span>
                  <span
                    className="text-[9px] font-semibold leading-none tracking-wide"
                    style={{
                      marginTop: "1mm",
                      color: active || center ? "#FFFFFF" : "#A7ABB2",
                      WebkitTextFillColor: active || center ? "#FFFFFF" : "#A7ABB2",
                      backgroundImage: "none",
                    }}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
};
