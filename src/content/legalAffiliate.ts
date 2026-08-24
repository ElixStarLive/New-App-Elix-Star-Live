/** Canonical PAGE-063 Affiliate & Sponsored Content copy. Approved legal text only. */

export const LEGAL_AFFILIATE_TITLE = "Affiliate & Sponsored Content";
export const LEGAL_AFFILIATE_CONTACT = "legal@elixstarlive.com";

export type LegalAffiliateSection = {
  title: string;
  paragraph: string;
  bullets?: readonly string[];
  contact?: boolean;
};

export const LEGAL_AFFILIATE_SECTIONS: readonly LegalAffiliateSection[] = [
  {
    title: "Disclosure",
    paragraph:
      "Some content on Elix Star Live may contain affiliate links, sponsored products, or paid partnerships. When creators or the platform receive compensation for promoting products or services, this will be disclosed in accordance with applicable advertising standards and regulations.",
  },
  {
    title: "Creator Responsibilities",
    paragraph: "If you are a creator who participates in sponsored or affiliate content, you must:",
    bullets: [
      "Clearly disclose any paid partnerships or affiliate relationships",
      'Use appropriate labels (e.g. "Ad", "Sponsored", "Paid Partnership")',
      "Comply with the UK Advertising Standards Authority (ASA) guidelines",
      "Comply with the US Federal Trade Commission (FTC) endorsement guidelines",
      "Not promote illegal, misleading, or harmful products",
    ],
  },
  {
    title: "Platform Partnerships",
    paragraph:
      "Elix Star Live may enter into partnerships with third-party brands and services. Any platform-level promotions will be clearly identified. Revenue generated from these partnerships helps support the development and maintenance of the App.",
  },
  {
    title: "User Protection",
    paragraph:
      "We are committed to transparency. If you believe any content on Elix Star Live contains undisclosed affiliate or sponsored material, please report it using the in-app reporting feature or contact us at ",
    contact: true,
  },
];

export const LEGAL_AFFILIATE_SECTION_TITLES = LEGAL_AFFILIATE_SECTIONS.map((section) => section.title);
