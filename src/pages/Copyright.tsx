import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SettingsOptionSheet from "@/components/SettingsOptionSheet";
import {
  LEGAL_COPYRIGHT_CONTACT,
  LEGAL_COPYRIGHT_DMCA_LABEL,
  LEGAL_COPYRIGHT_DMCA_PATH,
  LEGAL_COPYRIGHT_NOTICE,
  LEGAL_COPYRIGHT_SECTIONS,
  LEGAL_COPYRIGHT_TITLE,
} from "@/content/legalCopyright";
import { SETTINGS_HOME, containerReturnState, exitToFromLocationState } from "@/lib/settingsNav";

export default function Copyright() {
  const navigate = useNavigate();
  const location = useLocation();

  const exit = useCallback(() => {
    navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true });
  }, [navigate, location.state]);

  const goDmca = useCallback(() => {
    navigate(LEGAL_COPYRIGHT_DMCA_PATH, { state: containerReturnState("/copyright") });
  }, [navigate]);

  return (
    <SettingsOptionSheet onClose={exit} title={LEGAL_COPYRIGHT_TITLE}>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm] text-sm text-[#C8CDD5] space-y-5 leading-6">
        <p className="px-1">{LEGAL_COPYRIGHT_NOTICE}</p>
        {LEGAL_COPYRIGHT_SECTIONS.map((section) => (
          <section key={section.title} className="px-1">
            <h2 className="text-white font-semibold text-base mb-2">{section.title}</h2>
            <p>
              {section.paragraph}
              {section.dmcaLink ? (
                <>
                  <button type="button" onClick={goDmca} className="text-[#F5F5F7] underline">
                    {LEGAL_COPYRIGHT_DMCA_LABEL}
                  </button>
                  {section.afterLink}
                  <span className="text-white font-medium">{LEGAL_COPYRIGHT_CONTACT}</span>.
                </>
              ) : null}
            </p>
          </section>
        ))}
      </div>
    </SettingsOptionSheet>
  );
}
