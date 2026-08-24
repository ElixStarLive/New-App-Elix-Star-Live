/** Canonical PAGE-067 Community Guidelines copy. Approved content only. */

export const GUIDELINES_TITLE = "Community Guidelines";
export const GUIDELINES_UPDATED = "Last updated: February 4, 2026";
export const GUIDELINES_INTRO =
  "Elix Star is built on creativity, respect, and authenticity. These guidelines help keep our community safe and welcoming for everyone.";
export const GUIDELINES_REPORT_INTRO =
  "These guidelines are designed to foster a positive environment for everyone. If you see something that violates these guidelines, please report it.";
export const GUIDELINES_REPORT_LABEL = "Report a Violation";
export const GUIDELINES_REPORT_PATH = "/report";
export const GUIDELINES_SETTINGS_LABEL = "Go to Settings";

export type GuidelinesIcon = "heart" | "shield" | "users" | "eye" | "alert" | "ban";

export type GuidelinesSection = {
  icon: GuidelinesIcon;
  title: string;
  paragraph: string;
  bullets: readonly string[];
};

export const GUIDELINES_SECTIONS: readonly GuidelinesSection[] = [
  {
    icon: "heart",
    title: "Be Kind and Respectful",
    paragraph: "Treat others with respect. Harassment, bullying, and hate speech have no place here.",
    bullets: [
      "No targeted harassment or bullying",
      "No hate speech based on race, religion, gender, etc.",
      "Respect others' privacy and boundaries",
    ],
  },
  {
    icon: "shield",
    title: "Keep Content Safe",
    paragraph: "Help us maintain a safe environment for all users.",
    bullets: [
      "No sexual or adult content",
      "No violent or graphic content",
      "No promotion of dangerous activities",
      "No content involving minors in inappropriate situations",
    ],
  },
  {
    icon: "users",
    title: "Be Authentic",
    paragraph: "Build trust by being genuine and honest.",
    bullets: [
      "Don't impersonate others",
      "Don't post misleading information",
      "Don't engage in spam or manipulation",
    ],
  },
  {
    icon: "eye",
    title: "Respect Intellectual Property",
    paragraph: "Only share content you have the rights to use.",
    bullets: [
      "Don't post copyrighted content without permission",
      "Give credit to original creators",
      "Don't use copyrighted music without a license",
    ],
  },
  {
    icon: "alert",
    title: "No Illegal Activities",
    paragraph: "Content that promotes illegal activities is strictly prohibited.",
    bullets: [
      "No promotion of illegal drugs",
      "No fraudulent schemes or scams",
      "No content that violates local laws",
    ],
  },
  {
    icon: "ban",
    title: "Consequences",
    paragraph: "Violations may result in:",
    bullets: [
      "Content removal",
      "Temporary account suspension",
      "Permanent account ban",
      "Reporting to law enforcement (for serious violations)",
    ],
  },
];

export const GUIDELINES_SECTION_TITLES = GUIDELINES_SECTIONS.map((section) => section.title);
