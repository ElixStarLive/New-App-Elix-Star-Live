/** Canonical PAGE-069 Help & Support copy. Approved informational text only. */

export const SUPPORT_TITLE = "Help & Support";
export const SUPPORT_EMAIL = "support@elixstarlive.co.uk";
export const SUPPORT_MAILTO = "mailto:support@elixstarlive.co.uk";
export const SUPPORT_EMAIL_LABEL = "Email us directly";

export const SUPPORT_QUICK_LABEL = "Quick Links";
export const SUPPORT_FAQ_LABEL = "Frequently Asked Questions";
export const SUPPORT_LEGAL_LABEL = "Legal";

export type SupportLinkIcon = "message" | "shield" | "book";

export type SupportLink = {
  icon?: SupportLinkIcon;
  label: string;
  description?: string;
  path?: string;
  mailto?: boolean;
};

export const SUPPORT_QUICK_LINKS: readonly SupportLink[] = [
  {
    icon: "message",
    label: "Contact Support",
    description: "Send a message to our support team.",
    mailto: true,
  },
  {
    icon: "shield",
    label: "Safety Center",
    description: "Safety tools and reporting resources.",
    path: "/settings/safety",
  },
  {
    icon: "book",
    label: "Community Guidelines",
    description: "Read what content is allowed.",
    path: "/guidelines",
  },
];

export const SUPPORT_LEGAL_LINKS: readonly SupportLink[] = [
  { label: "Terms of Service", path: "/terms" },
  { label: "Privacy Policy", path: "/privacy" },
  { label: "Copyright Policy", path: "/copyright" },
];

export type SupportFaqItem = {
  question: string;
  answer: string;
};

export const SUPPORT_FAQ_ITEMS: readonly SupportFaqItem[] = [
  {
    question: "How do I earn coins?",
    answer:
      "You can purchase coins through the in-app store, or receive them as gifts from other users during your live streams.",
  },
  {
    question: "Are digital coin purchases refundable?",
    answer:
      "No. Digital coin purchases (Apple / Google Play) are final and non-refundable. Elix Star Live does not offer in-app coin refunds, and coins are not refunded through Stripe or the shop. Gifts sent with coins are also final.",
  },
  {
    question: "Can I get a refund on a shop purchase?",
    answer:
      "Shop purchases paid with Stripe may be eligible for a refund under our shop policy (for example unused/unfulfilled items within 14 days, subject to review). Contact support@elixstarlive.co.uk with your order/payment reference. Approved shop refunds are issued via Stripe — never as digital coins.",
  },
  {
    question: "What are battles?",
    answer:
      "Battles are live competitions between two streamers where viewers send gifts to support their favorite creator. The streamer with the most gifts at the end wins!",
  },
  {
    question: "How do I start a live stream?",
    answer: 'Tap the "+" button, select "Go Live", and follow the prompts to start broadcasting.',
  },
  {
    question: "Can I download my videos?",
    answer: 'Yes! Tap the three dots on your video and select "Download" to save it to your device.',
  },
  {
    question: "How do I delete my account?",
    answer: "Go to Settings → Account → Delete Account. This action is permanent and cannot be undone.",
  },
  {
    question: "What content is not allowed?",
    answer:
      "Please review our Community Guidelines for a complete list. In general, content that promotes violence, harassment, hate speech, or illegal activities is prohibited.",
  },
];

export const SUPPORT_FAQ_QUESTIONS = SUPPORT_FAQ_ITEMS.map((item) => item.question);
