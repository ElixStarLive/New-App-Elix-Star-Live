/** Canonical PAGE-064 DMCA / Copyright Policy copy. Approved legal text only. */

export const LEGAL_DMCA_TITLE = "DMCA / Copyright Policy";
export const LEGAL_DMCA_CONTACT = "dmca@elixstarlive.com";
export const LEGAL_DMCA_MAILTO_HREF = "mailto:dmca@elixstarlive.com?subject=DMCA%20Notice%20-%20ElixStarLive";
export const LEGAL_DMCA_MAILTO_LABEL = "Email DMCA Agent";
export const LEGAL_DMCA_INTRO =
  "Elix Star Live respects the intellectual property rights of others and expects our users to do the same. We comply with the Digital Millennium Copyright Act (DMCA) and equivalent UK/EU copyright regulations.";

export type LegalDmcaSection = {
  title: string;
  paragraph: string;
  bullets?: readonly string[];
  contact?: boolean;
  mailto?: boolean;
};

export const LEGAL_DMCA_SECTIONS: readonly LegalDmcaSection[] = [
  {
    title: "Copyright Infringement Notification",
    paragraph:
      "If you believe your copyrighted work has been used on Elix Star Live without authorisation, you may submit a DMCA takedown notice to our designated agent. Your notice must include:",
    bullets: [
      "Your full legal name and contact information (email, phone, address)",
      "A description of the copyrighted work that has been infringed",
      "The URL or location of the infringing content on our platform",
      "A statement that you have a good faith belief the use is not authorised by the copyright owner, its agent, or the law",
      "A statement, under penalty of perjury, that the information in your notice is accurate and that you are the copyright owner or authorised to act on their behalf",
      "Your physical or electronic signature",
    ],
  },
  {
    title: "Counter-Notification",
    paragraph: "If you believe your content was removed in error, you may file a counter-notification including:",
    bullets: [
      "Your full legal name and contact information",
      "Identification of the content that was removed",
      "A statement under penalty of perjury that you have a good faith belief the content was removed by mistake or misidentification",
      "Consent to the jurisdiction of the courts in your area",
      "Your physical or electronic signature",
    ],
  },
  {
    title: "Repeat Infringers",
    paragraph:
      "We maintain a policy of terminating, in appropriate circumstances, accounts of users who are repeat copyright infringers.",
  },
  {
    title: "Contact Our DMCA Agent",
    paragraph: "Send all DMCA notices and counter-notifications to:",
    contact: true,
    mailto: true,
  },
];

export const LEGAL_DMCA_SECTION_TITLES = LEGAL_DMCA_SECTIONS.map((section) => section.title);
