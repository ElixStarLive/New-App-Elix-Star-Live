import { useCallback } from "react";
import { ChevronRight } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import SettingsOptionSheet from "@/components/SettingsOptionSheet";
import {
  LEGAL_HUB_DMCA_CONTACT,
  LEGAL_HUB_ITEMS,
  LEGAL_HUB_SUPPORT_CONTACT,
  LEGAL_HUB_TITLE,
} from "@/content/legalHub";
import { LEGAL_HOME, SETTINGS_HOME, containerReturnState, exitToFromLocationState } from "@/lib/settingsNav";

export default function Legal() {
  const navigate = useNavigate();
  const location = useLocation();

  const exit = useCallback(() => {
    navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true });
  }, [navigate, location.state]);

  const openItem = useCallback(
    (path: string) => {
      navigate(path, { state: containerReturnState(LEGAL_HOME) });
    },
    [navigate],
  );

  return (
    <SettingsOptionSheet onClose={exit} title={LEGAL_HUB_TITLE}>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm]">
        <div className="flex flex-col gap-0">
          {LEGAL_HUB_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                type="button"
                className="w-full flex items-center gap-3 px-2.5 py-2.5 active:bg-white/5 text-left rounded-md"
                onClick={() => openItem(item.path)}
              >
                <span className="royce-glow-disc shrink-0" style={{ width: 36, height: 36 }} aria-hidden>
                  <Icon size={18} className="royce-icon-gold" />
                </span>
                <span className="flex-1 text-[15px] text-[#E6E9EE]">{item.label}</span>
                <ChevronRight size={16} className="text-white/30 shrink-0" />
              </button>
            );
          })}
          <div className="mt-4 px-2.5 pt-3 border-t border-white/10 text-xs text-[#8B9099] space-y-2">
            <div>
              DMCA: <span className="text-[#E6E9EE] font-semibold">{LEGAL_HUB_DMCA_CONTACT}</span>
            </div>
            <div>
              Support: <span className="text-[#E6E9EE] font-semibold">{LEGAL_HUB_SUPPORT_CONTACT}</span>
            </div>
          </div>
        </div>
      </div>
    </SettingsOptionSheet>
  );
}
