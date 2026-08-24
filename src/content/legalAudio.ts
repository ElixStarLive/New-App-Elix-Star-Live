/** Canonical PAGE-061 Audio & Music Disclaimer copy. Approved legal text only. */

export const LEGAL_AUDIO_TITLE = "Audio & Music Disclaimer";
export const LEGAL_AUDIO_CONTACT = "legal@elixstarlive.com";

export type LegalAudioBullet = {
  emphasis?: string;
  text: string;
};

export type LegalAudioSection = {
  title: string;
  paragraph: string;
  bullets?: readonly LegalAudioBullet[];
  contact?: boolean;
};

export const LEGAL_AUDIO_SECTIONS: readonly LegalAudioSection[] = [
  {
    title: "Audio Content",
    paragraph: "Audio used within Elix Star Live falls into the following categories:",
    bullets: [
      { emphasis: "Original audio:", text: "Created by Elix Star Live or its partners" },
      { emphasis: "User-generated audio:", text: "Uploaded or recorded by users" },
      { emphasis: "Licensed audio:", text: "Obtained under royalty-free or commercial licences" },
    ],
  },
  {
    title: "User Responsibility",
    paragraph: "When uploading content that contains audio, you confirm that you either:",
    bullets: [
      { text: "Created the audio yourself (it is your original work)" },
      { text: "Have obtained permission or a licence from the copyright holder" },
      { text: "The audio is in the public domain or available under a Creative Commons licence" },
    ],
  },
  {
    title: "Audio Removal",
    paragraph:
      "We reserve the right to mute, remove, or replace audio in any content that infringes on third-party copyrights. This may happen automatically or through manual review following a DMCA takedown notice.",
  },
  {
    title: "Live Streaming Audio",
    paragraph:
      "Playing copyrighted music during live streams may result in the stream being muted or terminated. You are responsible for ensuring you have the right to broadcast any audio content during your live sessions.",
  },
  {
    title: "Contact",
    paragraph: "For audio-related enquiries or disputes, contact us at ",
    contact: true,
  },
];

export const LEGAL_AUDIO_SECTION_TITLES = LEGAL_AUDIO_SECTIONS.map((section) => section.title);
