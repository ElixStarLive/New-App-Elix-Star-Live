/** Canonical PAGE-062 Legal UGC copy. Approved legal text only. */

export const LEGAL_UGC_TITLE = "User-Generated Content Policy";
export const LEGAL_UGC_DMCA_LABEL = "DMCA Policy";
export const LEGAL_UGC_DMCA_PATH = "/legal/dmca";

export type LegalUgcSection = {
  title: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
  dmcaLink?: boolean;
};

export const LEGAL_UGC_SECTIONS: readonly LegalUgcSection[] = [
  {
    title: "About UGC",
    paragraphs: [
      "Elix Star Live is a user-generated content (UGC) platform. Users create, upload, share, and interact with content including videos, live streams, comments, and messages. The views, opinions, and content expressed by users do not represent or reflect the views of Elix Star Live Ltd.",
    ],
  },
  {
    title: "User Responsibility",
    paragraphs: [
      "Users are solely responsible for the content they upload and share on the platform. By uploading content, you confirm that:",
    ],
    bullets: [
      "You own or have all necessary rights to the content",
      "The content does not infringe on any third-party intellectual property rights",
      "The content complies with our Community Guidelines and Terms of Service",
      "The content does not contain illegal, harmful, or misleading material",
    ],
  },
  {
    title: "Content Verification",
    paragraphs: [
      "Elix Star Live does not pre-screen, endorse, or verify all user-generated content. However, we reserve the right to review, moderate, and remove any content that violates our policies. We use a combination of automated detection and human moderation to maintain platform safety.",
    ],
  },
  {
    title: "Licence Grant",
    paragraphs: [
      "By posting content on Elix Star Live, you grant us a worldwide, non-exclusive, royalty-free licence to use, display, reproduce, distribute, and promote your content within and in connection with the App. This licence continues until you delete your content or account.",
    ],
  },
  {
    title: "Content Removal",
    paragraphs: [
      "We may remove or restrict access to content that violates our Terms of Service, Community Guidelines, or applicable law. Users can also report content using the in-app reporting tools. For copyright-related removal requests, please refer to our",
    ],
    dmcaLink: true,
  },
  {
    title: "Disclaimer",
    paragraphs: [
      "Elix Star Live Ltd is not liable for any user-generated content posted on the platform. We act as a hosting provider and comply with applicable safe harbour provisions. If you encounter content that concerns you, please report it immediately.",
    ],
  },
];

export const LEGAL_UGC_SECTION_TITLES = LEGAL_UGC_SECTIONS.map((section) => section.title);
