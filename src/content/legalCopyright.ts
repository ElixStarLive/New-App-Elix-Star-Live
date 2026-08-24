/** Canonical PAGE-059 Copyright Notice copy. Approved in-app legal text only. */

export const LEGAL_COPYRIGHT_TITLE = "Copyright Notice";
export const LEGAL_COPYRIGHT_NOTICE = "© 2026 Elix Star Live Ltd. All rights reserved.";
export const LEGAL_COPYRIGHT_DMCA_LABEL = "DMCA Policy";
export const LEGAL_COPYRIGHT_DMCA_PATH = "/legal/dmca";
export const LEGAL_COPYRIGHT_CONTACT = "dmca@elixstarlive.com";

export type CopyrightSection = {
  title: string;
  paragraph: string;
  dmcaLink?: boolean;
  afterLink?: string;
};

export const LEGAL_COPYRIGHT_SECTIONS: readonly CopyrightSection[] = [
  {
    title: "Ownership",
    paragraph:
      "All app content, design, branding, logos, software code, and user interface elements are the intellectual property of Elix Star Live Ltd unless otherwise stated. No part of this application may be reproduced, distributed, or transmitted in any form without prior written permission.",
  },
  {
    title: "User Content",
    paragraph:
      "Users retain ownership of the content they create and upload. By posting content on Elix Star Live, you grant us a worldwide, non-exclusive, royalty-free licence to display, distribute, and promote your content within and in connection with the App.",
  },
  {
    title: "Third-Party Content",
    paragraph:
      "Some content displayed in the App (such as profile avatars, video thumbnails, and user-generated media) is owned by respective users and third parties. Elix Star Live does not claim ownership of user-generated content.",
  },
  {
    title: "Trademarks",
    paragraph:
      '"Elix Star Live", the Elix Star Live logo, and related marks are trademarks of Elix Star Live Ltd. Use of these trademarks without written permission is prohibited.',
  },
  {
    title: "Report Copyright Infringement",
    paragraph: "If you believe your copyrighted work has been used without authorisation, please see our ",
    dmcaLink: true,
    afterLink: " or contact us at ",
  },
];

export const LEGAL_COPYRIGHT_SECTION_TITLES = LEGAL_COPYRIGHT_SECTIONS.map((section) => section.title);
