import { useCallback, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SettingsOptionSheet from "@/components/SettingsOptionSheet";
import {
  LEGAL_SUPPLIER_COMPANY,
  LEGAL_SUPPLIER_SECTIONS,
  LEGAL_SUPPLIER_TITLE,
  LEGAL_SUPPLIER_UPDATED,
  type LegalSupplierParagraph,
} from "@/content/legalSupplier";
import { SETTINGS_HOME, exitToFromLocationState } from "@/lib/settingsNav";

function renderParagraph(paragraph: LegalSupplierParagraph): ReactNode {
  if (paragraph.company) {
    const [before, after] = paragraph.text.split(LEGAL_SUPPLIER_COMPANY);
    return (
      <>
        {before}
        <span className="text-white font-medium">{LEGAL_SUPPLIER_COMPANY}</span>
        {after}
      </>
    );
  }
  if (paragraph.strong) {
    const [before, after] = paragraph.text.split(paragraph.strong);
    return (
      <>
        {before}
        <strong>{paragraph.strong}</strong>
        {after}
      </>
    );
  }
  return paragraph.text;
}

export default function LegalSupplier() {
  const navigate = useNavigate();
  const location = useLocation();

  const exit = useCallback(() => {
    navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true });
  }, [navigate, location.state]);

  return (
    <SettingsOptionSheet onClose={exit} title={LEGAL_SUPPLIER_TITLE}>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm] text-white">
        <div className="text-sm text-[#C8CDD5] space-y-5 leading-6 px-1">
          <p className="text-xs text-white/40 italic">{LEGAL_SUPPLIER_UPDATED}</p>
          {LEGAL_SUPPLIER_SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-white font-semibold text-base mb-2">{section.title}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph.text} className={paragraph.spaced ? "mt-2" : undefined}>
                  {renderParagraph(paragraph)}
                </p>
              ))}
              {section.bullets ? (
                <ul className="list-disc pl-5 space-y-1">
                  {section.bullets.map((item) => (
                    <li key={item.label ?? item.text}>
                      {item.label ? <span className="text-white font-medium">{item.label}</span> : null}
                      {item.label ? ` ${item.value}` : item.text}
                    </li>
                  ))}
                </ul>
              ) : null}
              {section.footer ? <p className="mt-3 text-white/60 text-xs">{section.footer}</p> : null}
            </section>
          ))}
        </div>
      </div>
    </SettingsOptionSheet>
  );
}
