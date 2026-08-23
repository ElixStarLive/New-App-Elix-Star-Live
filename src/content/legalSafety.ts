/** Canonical PAGE-065 Legal Safety copy. Approved legal text only. */

export const LEGAL_SAFETY_TITLE = "Safety Centre";
export const LEGAL_SAFETY_CONTACT = "safety@elixstarlive.com";
export const LEGAL_SAFETY_INTRO =
  "Elix Star Live is committed to maintaining a safe and respectful environment for all users. We take user safety seriously and provide multiple tools to help you stay safe.";

export type LegalSafetyBullet = {
  emphasis?: string;
  text: string;
};

export type LegalSafetySection = {
  title: string;
  paragraph?: string;
  bullets?: readonly LegalSafetyBullet[];
  contact?: boolean;
};

export const LEGAL_SAFETY_SECTIONS: readonly LegalSafetySection[] = [
  {
    title: "Reporting Content",
    paragraph:
      "If you see content that violates our Community Guidelines, you can report it directly from any video, live stream, profile, or message. Reports are reviewed by our moderation team and appropriate action is taken.",
  },
  {
    title: "Blocking Users",
    paragraph:
      "You can block any user at any time. Blocked users cannot see your content, send you messages, or interact with you. You can manage your blocked accounts list from Settings → Blocked Accounts.",
  },
  {
    title: "Live Stream Safety",
    bullets: [
      { text: "Live streams are monitored for violations of our Community Guidelines." },
      { text: "We may terminate a stream without notice if it contains prohibited content." },
      { text: "Viewers can report live streams in real time." },
      { text: "Creators can moderate their live chat and remove disruptive viewers." },
    ],
  },
  {
    title: "Content Moderation",
    paragraph: "We use a combination of automated systems and human review to detect and remove:",
    bullets: [
      { text: "Nudity and sexual content" },
      { text: "Violence and graphic content" },
      { text: "Hate speech and discrimination" },
      { text: "Harassment and bullying" },
      { text: "Spam and scams" },
      { text: "Illegal activities" },
    ],
  },
  {
    title: "Child Safety",
    paragraph:
      "Elix Star Live is not intended for users under 13. We do not knowingly collect information from children under 13. Any content that exploits or endangers minors is strictly prohibited and will be reported to relevant authorities.",
  },
  {
    title: "Emergency Resources",
    paragraph: "If you or someone you know is in immediate danger, please contact local emergency services.",
    bullets: [
      { emphasis: "UK:", text: "999 (Emergency) or 116 123 (Samaritans)" },
      { emphasis: "US:", text: "911 (Emergency) or 988 (Suicide & Crisis Lifeline)" },
      { emphasis: "EU:", text: "112 (Emergency)" },
    ],
  },
  {
    title: "Contact Us",
    paragraph: "For safety concerns, contact us at ",
    contact: true,
  },
];

export const LEGAL_SAFETY_SECTION_TITLES = LEGAL_SAFETY_SECTIONS.map((section) => section.title);
