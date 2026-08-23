/** Canonical PAGE-058 Privacy Policy copy. Approved in-app legal text only. */

export const LEGAL_PRIVACY_TITLE = "Privacy Policy";
export const LEGAL_PRIVACY_UPDATED_LABEL = "Last updated: February 20, 2026";
export const LEGAL_PRIVACY_SETTINGS_LABEL = "Go to Settings";

export type PrivacyPart = string | { em: string } | { strong: string };

export type PrivacyBlock =
  | { kind: "p"; parts: readonly PrivacyPart[]; gap?: "mt-2"; emphasis?: boolean }
  | { kind: "subhead"; text: string }
  | { kind: "ul"; items: readonly (readonly PrivacyPart[])[]; spaced?: boolean; plain?: boolean };

export type PrivacySection = {
  title: string;
  blocks: readonly PrivacyBlock[];
};

export const LEGAL_PRIVACY_INTRO: readonly PrivacyPart[] = [
  'Elix Star Live Ltd ("we", "us", "our"), registered in England and Wales, operates the Elix Star Live application. This Privacy Policy explains how we collect, use, store, and protect your personal data when you use our App.',
];

export const LEGAL_PRIVACY_SECTIONS: readonly PrivacySection[] = [
  {
    title: "1. Information We Collect",
    blocks: [
      { kind: "subhead", text: "Account Information" },
      {
        kind: "ul",
        spaced: true,
        items: [
          ["Email address"],
          ["Username and display name"],
          ["Profile picture"],
          ["Password (securely hashed — we never store plain-text passwords)"],
        ],
      },
      { kind: "subhead", text: "Usage Data" },
      {
        kind: "ul",
        spaced: true,
        items: [
          ["How you interact with the App (viewed content, liked videos, session duration)"],
          ["Search queries within the App"],
          ["Live stream and battle participation"],
        ],
      },
      { kind: "subhead", text: "Device Information" },
      {
        kind: "ul",
        spaced: true,
        items: [
          ["Device type, model, and operating system version"],
          ["Unique device identifiers"],
          ["IP address"],
          ["Browser type (when using the web version)"],
        ],
      },
      { kind: "subhead", text: "Camera & Microphone" },
      {
        kind: "ul",
        spaced: true,
        items: [
          ["Only accessed when you actively record a video, go live, or join a video call"],
          ["We do not access your camera or microphone in the background"],
        ],
      },
      { kind: "subhead", text: "Payment Information" },
      {
        kind: "ul",
        items: [
          ["Processed securely through Apple In-App Purchase, Google Play Billing, or Stripe"],
          ["We do not store your payment card details directly"],
          ["We store transaction records (amount, date, coin package purchased)"],
        ],
      },
    ],
  },
  {
    title: "2. Why We Collect Your Data",
    blocks: [
      {
        kind: "ul",
        items: [
          ["To provide and operate the App's features"],
          ["To personalise your content feed"],
          ["To process transactions (coin purchases, gifts)"],
          ["To send important notifications about your account"],
          ["To ensure safety, prevent abuse, and enforce our Community Guidelines"],
          ["To improve and develop the App"],
          ["To comply with legal obligations"],
        ],
      },
    ],
  },
  {
    title: "3. How We Store Your Data",
    blocks: [
      {
        kind: "p",
        parts: [
          "Your data is stored on secure servers (e.g. EU/US). All data is encrypted in transit (HTTPS/TLS) and at rest. Passwords are cryptographically hashed and never stored in plain text.",
        ],
      },
    ],
  },
  {
    title: "4. Data Sharing",
    blocks: [
      {
        kind: "p",
        parts: ["We do not sell your personal data. We may share data with:"],
      },
      {
        kind: "ul",
        items: [
          [
            { strong: "Service providers:" },
            " hosting, analytics, payment processing (Apple, Google, Stripe)",
          ],
          [
            { strong: "Law enforcement:" },
            " when required by law or to protect our legal rights",
          ],
          [
            { strong: "Other users:" },
            " your public profile, live streams, and public chat messages are visible to others",
          ],
        ],
      },
    ],
  },
  {
    title: "5. Data Retention",
    blocks: [
      {
        kind: "p",
        parts: [
          "We retain your data for as long as your account is active. If you delete your account, we permanently remove your personal data within 30 days, except where we are legally required to retain it (e.g. transaction records for tax compliance, which may be retained for up to 7 years).",
        ],
      },
    ],
  },
  {
    title: "6. Your Rights (GDPR / UK Data Protection Act 2018)",
    blocks: [
      {
        kind: "p",
        parts: ["As a user, you have the right to:"],
      },
      {
        kind: "ul",
        items: [
          [{ strong: "Access" }, " your personal data"],
          [{ strong: "Correct" }, " inaccurate or incomplete data via your profile settings"],
          [{ strong: "Delete" }, " your account and data at any time via Settings → Delete Account"],
          [{ strong: "Export" }, " your data by contacting us at info@elixstarlive.co.uk"],
          [{ strong: "Object" }, " to processing of your data for certain purposes"],
          [{ strong: "Withdraw consent" }, " at any time where processing is based on consent"],
          [
            { strong: "Lodge a complaint" },
            " with the UK Information Commissioner's Office (ICO) if you believe we have violated your data protection rights",
          ],
        ],
      },
      {
        kind: "p",
        gap: "mt-2",
        parts: [
          "To exercise any of these rights, contact us at ",
          { em: "info@elixstarlive.co.uk" },
          ". We will respond within 30 days.",
        ],
      },
    ],
  },
  {
    title: "7. Legal Basis for Processing (GDPR)",
    blocks: [
      {
        kind: "p",
        parts: ["We process your data under the following legal bases:"],
      },
      {
        kind: "ul",
        items: [
          [{ strong: "Contract:" }, " to provide the App services you signed up for"],
          [{ strong: "Consent:" }, " for optional features (e.g. push notifications, marketing)"],
          [
            { strong: "Legitimate interest:" },
            " to improve our services, prevent fraud, and ensure safety",
          ],
          [{ strong: "Legal obligation:" }, " to comply with applicable laws and regulations"],
        ],
      },
    ],
  },
  {
    title: "8. International Data Transfers",
    blocks: [
      {
        kind: "p",
        parts: [
          "Your data may be transferred to and processed in countries outside the UK/EEA. Where this occurs, we ensure appropriate safeguards are in place (e.g. Standard Contractual Clauses or adequacy decisions) to protect your data in accordance with applicable law.",
        ],
      },
    ],
  },
  {
    title: "9. Cookies & Tracking",
    blocks: [
      {
        kind: "p",
        parts: [
          "The App uses minimal cookies and local storage to maintain your session and preferences. We do not use third-party advertising trackers. Analytics data is associated with your account and used only to improve the App experience; it is deleted with your account.",
        ],
      },
    ],
  },
  {
    title: "10. Children's Privacy",
    blocks: [
      {
        kind: "p",
        parts: [
          "Elix Star Live is not intended for children under 13. We do not knowingly collect personal data from children under 13. If we become aware that a child under 13 has provided us with personal data, we will take steps to delete that information promptly.",
        ],
      },
    ],
  },
  {
    title: "11. Security",
    blocks: [
      {
        kind: "p",
        parts: [
          "We use industry-standard security measures to protect your data, including HTTPS encryption, hashed passwords (bcrypt), secure server infrastructure, and regular security audits. However, no method of transmission over the internet is 100% secure.",
        ],
      },
    ],
  },
  {
    title: "12. Changes to This Policy",
    blocks: [
      {
        kind: "p",
        parts: [
          "We may update this Privacy Policy from time to time. We will notify you of material changes via email or in-app notification. Continued use after changes constitutes acceptance of the updated policy.",
        ],
      },
    ],
  },
  {
    title: "13. Data Protection Officer",
    blocks: [
      {
        kind: "p",
        parts: ["For data protection enquiries, contact our Data Protection Officer at:"],
      },
      {
        kind: "p",
        emphasis: true,
        parts: ["info@elixstarlive.co.uk"],
      },
    ],
  },
  {
    title: "14. Contact Us",
    blocks: [
      {
        kind: "p",
        parts: ["For any privacy questions or requests:"],
      },
      {
        kind: "ul",
        plain: true,
        items: [
          [{ em: "Email:" }, " info@elixstarlive.co.uk"],
          [{ em: "Company:" }, " Elix Star Live Ltd"],
          [{ em: "Jurisdiction:" }, " England and Wales"],
        ],
      },
    ],
  },
];

export const LEGAL_PRIVACY_SECTION_TITLES = LEGAL_PRIVACY_SECTIONS.map((section) => section.title);
