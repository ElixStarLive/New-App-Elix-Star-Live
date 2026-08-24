import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SettingsOptionSheet from "@/components/SettingsOptionSheet";
import {
  LEGAL_AFFILIATE_CONTACT,
  LEGAL_AFFILIATE_SECTIONS,
  LEGAL_AFFILIATE_TITLE,
} from "@/content/legalAffiliate";
import { SETTINGS_HOME, exitToFromLocationState } from "@/lib/settingsNav";

export default function LegalAffiliate() {
  const navigate = useNavigate();
  const location = useLocation();

  const exit = useCallback(() => {
    navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true });
  }, [navigate, location.state]);

  return (
    <SettingsOptionSheet onClose={exit} title={LEGAL_AFFILIATE_TITLE}>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm] text-white">
        <div className="text-sm text-[#C8CDD5] space-y-5 leading-6 px-1">
          {LEGAL_AFFILIATE_SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-white font-semibold text-base mb-2">{section.title}</h2>
              <p>
                {section.paragraph}
                {section.contact ? <span className="text-white font-medium">{LEGAL_AFFILIATE_CONTACT}</span> : null}
                {section.contact ? "." : null}
              </p>
              {section.bullets ? (
                <ul className="list-disc pl-5 space-y-1 mt-2">
                  {section.bullets.map((item) => (
                    <li key={item}>{item}</li>
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
