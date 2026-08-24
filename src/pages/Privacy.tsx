import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import SettingsOptionSheet from "@/components/SettingsOptionSheet";
import {
  LEGAL_PRIVACY_INTRO,
  LEGAL_PRIVACY_SECTIONS,
  LEGAL_PRIVACY_SETTINGS_LABEL,
  LEGAL_PRIVACY_TITLE,
  LEGAL_PRIVACY_UPDATED_LABEL,
  type PrivacyPart,
} from "@/content/legalPrivacy";
import { SETTINGS_HOME, exitToFromLocationState } from "@/lib/settingsNav";

function PrivacyInline({ parts }: { parts: readonly PrivacyPart[] }) {
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

export default function Privacy() {
  const navigate = useNavigate();
  const location = useLocation();

  const exit = useCallback(() => {
    navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true });
  }, [navigate, location.state]);

  const goSettings = useCallback(() => {
    navigate(SETTINGS_HOME, { state: location.state });
  }, [navigate, location.state]);

  return (
    <SettingsOptionSheet onClose={exit} title={LEGAL_PRIVACY_TITLE}>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm] text-white">
        <div className="text-xs text-[#8B9099] italic mb-4 px-1">{LEGAL_PRIVACY_UPDATED_LABEL}</div>
        <div className="text-sm text-[#C8CDD5] space-y-5 leading-6 px-1">
          <p>
            <PrivacyInline parts={LEGAL_PRIVACY_INTRO} />
          </p>
          {LEGAL_PRIVACY_SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-[#E6E9EE] font-semibold text-base mb-2">{section.title}</h2>
              {section.blocks.map((block, blockIndex) => {
                if (block.kind === "subhead") {
                  return (
                    <p key={blockIndex} className="font-medium text-white/90 mb-1">
                      {block.text}
                    </p>
                  );
                }
                if (block.kind === "ul") {
                  return (
                    <ul
                      key={blockIndex}
                      className={
                        block.plain
                          ? "list-none space-y-1"
                          : `list-disc pl-5 space-y-1${block.spaced ? " mb-3" : ""}`
                      }
                    >
                      {block.items.map((item, itemIndex) => (
                        <li key={itemIndex}>
                          <PrivacyInline parts={item} />
                        </li>
                      ))}
                    </ul>
                  );
                }
                const className = [
                  block.emphasis ? "text-white font-medium" : "",
                  block.gap === "mt-2" ? "mt-2" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <p key={blockIndex} className={className || undefined}>
                    <PrivacyInline parts={block.parts} />
                  </p>
                );
              })}
            </section>
          ))}
          <div className="pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={goSettings}
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium transition text-[#E6E9EE]"
            >
              {LEGAL_PRIVACY_SETTINGS_LABEL}
            </button>
          </div>
        </div>
      </div>
    </SettingsOptionSheet>
  );
}
