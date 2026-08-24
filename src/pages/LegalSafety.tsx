import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SettingsOptionSheet from "@/components/SettingsOptionSheet";
import {
  LEGAL_SAFETY_CONTACT,
  LEGAL_SAFETY_INTRO,
  LEGAL_SAFETY_SECTIONS,
  LEGAL_SAFETY_TITLE,
} from "@/content/legalSafety";
import { SETTINGS_HOME, exitToFromLocationState } from "@/lib/settingsNav";

export default function LegalSafety() {
  const navigate = useNavigate();
  const location = useLocation();

  const exit = useCallback(() => {
    navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true });
  }, [navigate, location.state]);

  return (
    <SettingsOptionSheet onClose={exit} title={LEGAL_SAFETY_TITLE}>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm] text-white">
        <div className="text-sm text-[#C8CDD5] space-y-5 leading-6 px-1">
          <p>{LEGAL_SAFETY_INTRO}</p>
          {LEGAL_SAFETY_SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-white font-semibold text-base mb-2">{section.title}</h2>
              {section.paragraph ? (
                <p>
                  {section.paragraph}
                  {section.contact ? <span className="text-white font-medium">{LEGAL_SAFETY_CONTACT}</span> : null}
                </p>
              ) : null}
              {section.bullets ? (
                <ul className="list-disc pl-5 space-y-1">
                  {section.bullets.map((item) => (
                    <li key={`${item.emphasis ?? ""}${item.text}`}>
                      {item.emphasis ? <strong>{item.emphasis}</strong> : null}
                      {item.emphasis ? ` ${item.text}` : item.text}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </SettingsOptionSheet>
  );
}
