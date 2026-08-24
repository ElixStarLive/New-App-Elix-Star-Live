import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SettingsOptionSheet from "@/components/SettingsOptionSheet";
import {
  LEGAL_UGC_DMCA_LABEL,
  LEGAL_UGC_DMCA_PATH,
  LEGAL_UGC_SECTIONS,
  LEGAL_UGC_TITLE,
} from "@/content/legalUgc";
import { SETTINGS_HOME, containerReturnState, exitToFromLocationState } from "@/lib/settingsNav";

export default function LegalUGC() {
  const navigate = useNavigate();
  const location = useLocation();

  const exit = useCallback(() => {
    navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true });
  }, [navigate, location.state]);

  const goDmca = useCallback(() => {
    navigate(LEGAL_UGC_DMCA_PATH, { state: containerReturnState("/legal/ugc") });
  }, [navigate]);

  return (
    <SettingsOptionSheet onClose={exit} title={LEGAL_UGC_TITLE}>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm] text-white">
        <div className="text-sm text-[#C8CDD5] space-y-5 leading-6 px-1">
          {LEGAL_UGC_SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-white font-semibold text-base mb-2">{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>
                  {paragraph}
                  {section.dmcaLink ? (
                    <>
                      {" "}
                      <button
                        type="button"
                        onClick={goDmca}
                        className="text-[#F5F5F7] underline"
                      >
                        {LEGAL_UGC_DMCA_LABEL}
                      </button>
                      .
                    </>
                  ) : null}
                </p>
              ))}
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
