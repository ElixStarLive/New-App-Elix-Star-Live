import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SettingsOptionSheet from "@/components/SettingsOptionSheet";
import {
  LEGAL_TERMS_TITLE,
  LEGAL_TERMS_UPDATED_LABEL,
  legalTermsSections,
  type TermsPart,
} from "@/content/legalTerms";
import { SETTINGS_HOME, exitToFromLocationState } from "@/lib/settingsNav";
import { platform } from "@/lib/platform";

function TermsInline({ parts }: { parts: readonly TermsPart[] }) {
  return (
    <>
      {parts.map((part, index) => {
        if (typeof part === "string") return <span key={index}>{part}</span>;
        if ("em" in part) {
          return (
            <span key={index} className="text-white font-medium">
              {part.em}
            </span>
          );
        }
        return <strong key={index}>{part.strong}</strong>;
      })}
    </>
  );
}

export default function Terms() {
  const navigate = useNavigate();
  const location = useLocation();
  const sections = legalTermsSections(platform.isIOS);

  const exit = useCallback(() => {
    navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true });
  }, [navigate, location.state]);

  return (
    <SettingsOptionSheet onClose={exit} title={LEGAL_TERMS_TITLE}>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm] text-white">
        <div className="text-xs text-[#8B9099] italic mb-4 px-1">{LEGAL_TERMS_UPDATED_LABEL}</div>
        <div className="text-sm text-[#C8CDD5] space-y-5 leading-6 px-1">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-white font-semibold text-base mb-2">{section.title}</h2>
              {section.blocks.map((block, blockIndex) => {
                if (block.kind === "ul") {
                  return (
                    <ul key={blockIndex} className="list-disc pl-5 space-y-1">
                      {block.items.map((item, itemIndex) => (
                        <li key={itemIndex}>
                          <TermsInline parts={item} />
                        </li>
                      ))}
                    </ul>
                  );
                }
                const className = [
                  block.note ? "text-white/60 text-xs" : "",
                  block.gap === "mt-2" ? "mt-2" : "",
                  block.gap === "mb-2" ? "mb-2" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <p key={blockIndex} className={className || undefined}>
                    <TermsInline parts={block.parts} />
                  </p>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </SettingsOptionSheet>
  );
}
