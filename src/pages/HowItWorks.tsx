import { useCallback, type ReactNode } from "react";
import {
  Banknote,
  BookOpen,
  Clapperboard,
  Crown,
  Gift,
  Heart,
  Radio,
  Shield,
  Star,
  Swords,
  Users,
  Video,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import SettingsOptionSheet from "@/components/SettingsOptionSheet";
import {
  HOW_IT_WORKS_ENGAGEMENT_LABEL,
  HOW_IT_WORKS_ENGAGEMENT_PATH,
  HOW_IT_WORKS_GUIDELINES_LABEL,
  HOW_IT_WORKS_GUIDELINES_PATH,
  HOW_IT_WORKS_INTRO,
  HOW_IT_WORKS_SECTIONS,
  HOW_IT_WORKS_SUPPORT_LABEL,
  HOW_IT_WORKS_SUPPORT_PATH,
  HOW_IT_WORKS_TITLE,
  HOW_IT_WORKS_UPDATED,
  howItWorksBulletText,
  howItWorksParagraphText,
  type HowItWorksIcon,
  type HowItWorksMark,
} from "@/content/howItWorks";
import {
  SETTINGS_HOME,
  containerReturnState,
  exitToFromLocationState,
  returnToFromLocationState,
} from "@/lib/settingsNav";

const HOW_IT_WORKS_ICONS: Record<HowItWorksIcon, ReactNode> = {
  clapperboard: <Clapperboard className="w-5 h-5" />,
  video: <Video className="w-5 h-5" />,
  radio: <Radio className="w-5 h-5" />,
  swords: <Swords className="w-5 h-5" />,
  gift: <Gift className="w-5 h-5" />,
  banknote: <Banknote className="w-5 h-5" />,
  star: <Star className="w-5 h-5" />,
  crown: <Crown className="w-5 h-5" />,
  users: <Users className="w-5 h-5" />,
  shield: <Shield className="w-5 h-5" />,
  heart: <Heart className="w-5 h-5" />,
};

function renderMarks(marks: readonly HowItWorksMark[]): ReactNode {
  return marks.map((mark, index) => {
    if (mark.strong) {
      return (
        <strong key={`s-${index}`} className="text-[#E6E9EE]">
          {mark.strong}
        </strong>
      );
    }
    if (mark.em) {
      return <em key={`e-${index}`}>{mark.em}</em>;
    }
    return <span key={`t-${index}`}>{mark.text}</span>;
  });
}

export default function HowItWorks() {
  const navigate = useNavigate();
  const location = useLocation();
  const childReturnState = containerReturnState(returnToFromLocationState(location.state) || "/how-it-works");

  const exit = useCallback(() => {
    navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true });
  }, [navigate, location.state]);

  const go = useCallback(
    (path: string) => {
      navigate(path, { state: childReturnState });
    },
    [navigate, childReturnState],
  );

  return (
    <SettingsOptionSheet onClose={exit} title={HOW_IT_WORKS_TITLE}>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm] text-white">
        <div className="flex items-center gap-2 px-1 mb-3">
          <BookOpen className="w-4 h-4 text-[#E6E9EE] shrink-0" aria-hidden />
          <div className="text-xs text-[#8B9099] italic">{HOW_IT_WORKS_UPDATED}</div>
        </div>
        <div className="text-sm text-[#C8CDD5] space-y-5 leading-6 px-1">
          <p>{HOW_IT_WORKS_INTRO}</p>
          {HOW_IT_WORKS_SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="flex items-center gap-2 text-white font-semibold text-base mb-2">
                <span className="text-[#E6E9EE] flex-shrink-0">{HOW_IT_WORKS_ICONS[section.icon]}</span>
                {section.title}
              </h2>
              {section.paragraphs?.map((marks) => (
                <p key={howItWorksParagraphText(marks)} className="mb-2">
                  {renderMarks(marks)}
                </p>
              ))}
              {section.bullets ? (
                <ul className="list-disc pl-5 space-y-1.5">
                  {section.bullets.map((bullet) => (
                    <li key={howItWorksBulletText(bullet)}>
                      {bullet.marks ? renderMarks(bullet.marks) : bullet.text}
                    </li>
                  ))}
                </ul>
              ) : null}
              {section.footer ? <p className="mt-2 text-xs text-[#8B9099]">{section.footer}</p> : null}
            </section>
          ))}
          <div className="pt-2 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => go(HOW_IT_WORKS_ENGAGEMENT_PATH)}
              className="w-full py-3 bg-[#E6E9EE] text-white rounded-xl font-bold active:opacity-90 transition"
            >
              {HOW_IT_WORKS_ENGAGEMENT_LABEL}
            </button>
            <button
              type="button"
              onClick={() => go(HOW_IT_WORKS_SUPPORT_PATH)}
              className="w-full py-3 bg-white/10 text-white rounded-xl font-semibold active:bg-white/15 transition"
            >
              {HOW_IT_WORKS_SUPPORT_LABEL}
            </button>
            <button
              type="button"
              onClick={() => go(HOW_IT_WORKS_GUIDELINES_PATH)}
              className="w-full py-3 bg-white/10 text-white rounded-xl font-semibold active:bg-white/15 transition"
            >
              {HOW_IT_WORKS_GUIDELINES_LABEL}
            </button>
          </div>
        </div>
      </div>
    </SettingsOptionSheet>
  );
}
