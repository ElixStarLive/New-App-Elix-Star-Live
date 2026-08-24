import { useCallback, useState, type ReactNode } from "react";
import { Book, ChevronRight, HelpCircle, Mail, MessageCircle, Shield } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import SettingsOptionSheet from "@/components/SettingsOptionSheet";
import {
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_LABEL,
  SUPPORT_FAQ_ITEMS,
  SUPPORT_FAQ_LABEL,
  SUPPORT_LEGAL_LABEL,
  SUPPORT_LEGAL_LINKS,
  SUPPORT_MAILTO,
  SUPPORT_QUICK_LABEL,
  SUPPORT_QUICK_LINKS,
  SUPPORT_TITLE,
  type SupportLink,
  type SupportLinkIcon,
} from "@/content/support";
import {
  SETTINGS_HOME,
  containerReturnState,
  exitToFromLocationState,
  returnToFromLocationState,
} from "@/lib/settingsNav";

const SUPPORT_ICONS: Record<SupportLinkIcon, ReactNode> = {
  message: <MessageCircle size={14} />,
  shield: <Shield size={14} />,
  book: <Book size={14} />,
};

function SupportSection({ label }: { label: string }) {
  return <div className="mt-3.5 mb-1 px-1 text-[10px] uppercase tracking-[0.12em] text-[#8B9099] leading-none">{label}</div>;
}

function SupportRowBody({ item }: { item: SupportLink }) {
  return (
    <>
      {item.icon ? (
        <span className="royce-glow-disc shrink-0 [&_svg]:size-[18px]" style={{ width: 36, height: 36 }}>
          <span className="royce-icon-gold">{SUPPORT_ICONS[item.icon]}</span>
        </span>
      ) : null}
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] leading-tight text-[#E6E9EE]">{item.label}</span>
        {item.description ? <span className="block text-xs text-[#8B9099] mt-0.5">{item.description}</span> : null}
      </span>
      <ChevronRight size={16} className="text-white/30 shrink-0" />
    </>
  );
}

export default function Support() {
  const navigate = useNavigate();
  const location = useLocation();
  const childReturnState = containerReturnState(returnToFromLocationState(location.state) || "/support");
  const [openQuestions, setOpenQuestions] = useState<ReadonlySet<string>>(() => new Set());

  const exit = useCallback(() => {
    navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true });
  }, [navigate, location.state]);

  const go = useCallback(
    (path: string) => {
      navigate(path, { state: childReturnState });
    },
    [navigate, childReturnState],
  );

  const toggleQuestion = useCallback((question: string) => {
    setOpenQuestions((current) => {
      const next = new Set(current);
      if (next.has(question)) next.delete(question);
      else next.add(question);
      return next;
    });
  }, []);

  return (
    <SettingsOptionSheet onClose={exit} title={SUPPORT_TITLE}>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm]">
        <div className="flex flex-col gap-0 max-w-full min-h-full">
          <SupportSection label={SUPPORT_QUICK_LABEL} />
          {SUPPORT_QUICK_LINKS.map((item) =>
            item.mailto ? (
              <a
                key={item.label}
                href={SUPPORT_MAILTO}
                className="w-full flex items-center gap-3 px-2.5 py-2.5 active:bg-white/5 text-left rounded-md no-underline"
              >
                <SupportRowBody item={item} />
              </a>
            ) : (
              <button
                key={item.label}
                type="button"
                onClick={() => item.path && go(item.path)}
                className="w-full flex items-center gap-3 px-2.5 py-2.5 active:bg-white/5 text-left rounded-md"
              >
                <SupportRowBody item={item} />
              </button>
            ),
          )}

          <SupportSection label={SUPPORT_FAQ_LABEL} />
          {SUPPORT_FAQ_ITEMS.map((item) => {
            const isOpen = openQuestions.has(item.question);
            return (
              <div key={item.question}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => toggleQuestion(item.question)}
                  className="w-full flex items-center justify-between gap-2.5 px-2.5 py-2.5 active:bg-white/5 transition text-left rounded-md"
                >
                  <span className="text-sm text-[#E6E9EE] pr-2">{item.question}</span>
                  <HelpCircle className={`w-4 h-4 text-[#8B9099] flex-shrink-0 transition ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen ? (
                  <div className="px-2.5 pb-2.5 text-[13px] leading-relaxed text-[#C8CDD5]">{item.answer}</div>
                ) : null}
              </div>
            );
          })}

          <SupportSection label={SUPPORT_LEGAL_LABEL} />
          {SUPPORT_LEGAL_LINKS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => item.path && go(item.path)}
              className="w-full flex items-center gap-3 px-2.5 py-2.5 active:bg-white/5 text-left rounded-md"
            >
              <SupportRowBody item={item} />
            </button>
          ))}

          <div className="mt-3.5 px-2.5 py-3 text-center">
            <Mail className="w-5 h-5 text-[#E6E9EE] mx-auto mb-2" />
            <div className="text-sm text-[#C8CDD5] mb-1">{SUPPORT_EMAIL_LABEL}</div>
            <a href={SUPPORT_MAILTO} className="text-sm text-[#E6E9EE]">
              {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      </div>
    </SettingsOptionSheet>
  );
}
