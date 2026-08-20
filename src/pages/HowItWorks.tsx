import { useLocation, useNavigate } from "react-router-dom";
import {
  Banknote,
  BookOpen,
  Clapperboard,
  Gift,
  Radio,
  Shield,
  Swords,
  Users,
  Video,
} from "lucide-react";
import { PageScaffold } from "@/components/PageScaffold";
import { SETTINGS_HOME, exitToFromLocationState } from "@/lib/settingsNav";
import type { ReactNode } from "react";

export default function HowItWorks() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <PageScaffold title="How the app works" onClose={() => navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true })}>
      <div className="px-3 pt-2 pb-[3mm] text-white">
        <div className="flex items-center gap-2 px-1 mb-3">
          <BookOpen className="w-4 h-4 text-[#E6E9EE] shrink-0" aria-hidden />
          <div className="text-xs text-[#8B9099] italic">Full guide for fans and creators.</div>
        </div>
        <div className="text-sm text-[#C8CDD5] space-y-5 leading-6 px-1">
          <p>
            Elix Star Live is a short-video and live streaming app. Watch For You, go LIVE, send paid-coin gifts, and use Shop checkout on Stripe. Test coins are never money.
          </p>
          <Section icon={<Clapperboard className="w-5 h-5" />} title="Main tabs">
            Home is For You. Friends is people you follow. Create opens the camera. Inbox is messages. Profile is your videos and settings.
          </Section>
          <Section icon={<Video className="w-5 h-5" />} title="Videos, sound & duets">
            Record or upload from Create. Add a caption and sound before you post. Side controls like, comment, save, and share.
          </Section>
          <Section icon={<Radio className="w-5 h-5" />} title="LIVE">
            Go live from Create → LIVE. Spectators join from Live Discover or a live card on For You.
          </Section>
          <Section icon={<Swords className="w-5 h-5" />} title="Battles">
            Battle score comes from gifts and the one-tap battle score. Test-coin gifts add score only. Paid gifts can earn creators.
          </Section>
          <Section icon={<Gift className="w-5 h-5" />} title="Coins & gifts">
            Mobile coins use Apple or Google in-app purchase only. Stripe is shop checkout only. Test coins never go through IAP, Stripe, or payouts.
          </Section>
          <Section icon={<Banknote className="w-5 h-5" />} title="Shop">
            Shop listings check out with Stripe. That is separate from in-app coins.
          </Section>
          <Section icon={<Users className="w-5 h-5" />} title="Engagement Hub">
            Missions, fan level, MVP, and daily login live under Settings → Engagement Hub.
          </Section>
          <Section icon={<Shield className="w-5 h-5" />} title="Safety">
            Report, block, and the Safety Center are in Settings. Paid gifts follow the 60/40 split from paid coin lots only.
          </Section>
        </div>
      </div>
    </PageScaffold>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="royce-glow-disc" style={{ width: 28, height: 28 }} aria-hidden>
          {icon}
        </span>
        <h2 className="text-[#E6E9EE] font-bold text-sm">{title}</h2>
      </div>
      <div className="pl-1">{children}</div>
    </div>
  );
}
