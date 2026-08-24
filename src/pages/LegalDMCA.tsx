import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SettingsOptionSheet from "@/components/SettingsOptionSheet";
import {
  LEGAL_DMCA_CONTACT,
  LEGAL_DMCA_MAILTO_HREF,
  LEGAL_DMCA_MAILTO_LABEL,
  LEGAL_DMCA_INTRO,
  LEGAL_DMCA_SECTIONS,
  LEGAL_DMCA_TITLE,
} from "@/content/legalDmca";
import { SETTINGS_HOME, exitToFromLocationState } from "@/lib/settingsNav";

export default function LegalDMCA() {
  const navigate = useNavigate();
  const location = useLocation();

  const exit = useCallback(() => {
    navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true });
  }, [navigate, location.state]);

  return (
    <SettingsOptionSheet onClose={exit} title={LEGAL_DMCA_TITLE}>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm] text-white">
        <div className="text-sm text-[#C8CDD5] space-y-5 leading-6 px-1">
          <p>{LEGAL_DMCA_INTRO}</p>
          {LEGAL_DMCA_SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-white font-semibold text-base mb-2">{section.title}</h2>
              <p>{section.paragraph}</p>
              {section.bullets ? (
                <ul className="list-disc pl-5 space-y-1 mt-2">
                  {section.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {section.contact ? <p className="text-white font-medium mt-2">{LEGAL_DMCA_CONTACT}</p> : null}
              {section.mailto ? (
                <div className="pt-3">
                  <a
                    className="inline-flex items-center justify-center rounded-xl bg-[#E6E9EE] text-white font-bold px-4 py-2 text-sm"
                    href={LEGAL_DMCA_MAILTO_HREF}
                  >
                    {LEGAL_DMCA_MAILTO_LABEL}
                  </a>
                </div>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </SettingsOptionSheet>
  );
}
