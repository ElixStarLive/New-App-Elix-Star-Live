import { useCallback, type ReactNode } from "react";
import { AlertTriangle, Ban, Eye, Heart, Shield, Users } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import SettingsOptionSheet from "@/components/SettingsOptionSheet";
import {
  GUIDELINES_INTRO,
  GUIDELINES_REPORT_INTRO,
  GUIDELINES_REPORT_LABEL,
  GUIDELINES_REPORT_PATH,
  GUIDELINES_SECTIONS,
  GUIDELINES_SETTINGS_LABEL,
  GUIDELINES_TITLE,
  GUIDELINES_UPDATED,
  type GuidelinesIcon,
} from "@/content/guidelines";
import {
  SETTINGS_HOME,
  containerReturnState,
  exitToFromLocationState,
  returnToFromLocationState,
} from "@/lib/settingsNav";

const GUIDELINES_ICONS: Record<GuidelinesIcon, ReactNode> = {
  heart: <Heart className="w-5 h-5" />,
  shield: <Shield className="w-5 h-5" />,
  users: <Users className="w-5 h-5" />,
  eye: <Eye className="w-5 h-5" />,
  alert: <AlertTriangle className="w-5 h-5" />,
  ban: <Ban className="w-5 h-5" />,
};

export default function Guidelines() {
  const navigate = useNavigate();
  const location = useLocation();
  const childReturnState = containerReturnState(returnToFromLocationState(location.state) || "/guidelines");

  const exit = useCallback(() => {
    navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true });
  }, [navigate, location.state]);

  const goReport = useCallback(() => {
    navigate(GUIDELINES_REPORT_PATH, { state: childReturnState });
  }, [navigate, childReturnState]);

  return (
    <SettingsOptionSheet onClose={exit} title={GUIDELINES_TITLE}>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm] text-white">
        <div className="text-xs text-[#8B9099] italic mb-4 px-1">{GUIDELINES_UPDATED}</div>
        <div className="text-sm text-[#C8CDD5] space-y-5 leading-6 px-1">
          <p>{GUIDELINES_INTRO}</p>
          {GUIDELINES_SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="flex items-center gap-2 text-white font-semibold text-base mb-2">
                <span className="text-[#E6E9EE] flex-shrink-0">{GUIDELINES_ICONS[section.icon]}</span>
                {section.title}
              </h2>
              <p>{section.paragraph}</p>
              <ul className="list-disc pl-5 space-y-1 mt-2">
                {section.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
          <div>
            <p className="mb-3">{GUIDELINES_REPORT_INTRO}</p>
            <button
              type="button"
              onClick={goReport}
              className="w-full py-3 bg-transparent border border-[#D8D9DD]/40 text-[#F5F5F7] rounded-xl font-bold hover:bg-white/10 transition"
            >
              {GUIDELINES_REPORT_LABEL}
            </button>
          </div>
          <div className="pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={exit}
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium transition"
            >
              {GUIDELINES_SETTINGS_LABEL}
            </button>
          </div>
        </div>
      </div>
    </SettingsOptionSheet>
  );
}
