/** Canonical PAGE-068 How the app works copy. Approved informational text only. */

export const HOW_IT_WORKS_TITLE = "How the app works";
export const HOW_IT_WORKS_UPDATED = "Full guide for fans and creators. Last updated: August 5, 2026";
export const HOW_IT_WORKS_INTRO =
  "Elix Star Live is a short-video and live streaming app. Watch the For You feed, go LIVE, battle other creators, send gifts, and grow through the Engagement Hub — without mixing fake test coins into real money.";

export const HOW_IT_WORKS_ENGAGEMENT_LABEL = "Open Engagement Hub";
export const HOW_IT_WORKS_ENGAGEMENT_PATH = "/engagement";
export const HOW_IT_WORKS_SUPPORT_LABEL = "Help & Support";
export const HOW_IT_WORKS_SUPPORT_PATH = "/support";
export const HOW_IT_WORKS_GUIDELINES_LABEL = "Community Guidelines";
export const HOW_IT_WORKS_GUIDELINES_PATH = "/guidelines";

export type HowItWorksIcon =
  | "clapperboard"
  | "video"
  | "radio"
  | "swords"
  | "gift"
  | "banknote"
  | "star"
  | "crown"
  | "users"
  | "shield"
  | "heart";

export type HowItWorksMark = {
  text?: string;
  strong?: string;
  em?: string;
};

export type HowItWorksBullet = {
  text?: string;
  marks?: readonly HowItWorksMark[];
};

export type HowItWorksSection = {
  icon: HowItWorksIcon;
  title: string;
  paragraphs?: readonly HowItWorksMark[][];
  bullets?: readonly HowItWorksBullet[];
  footer?: string;
};

export const HOW_IT_WORKS_SECTIONS: readonly HowItWorksSection[] = [
  {
    icon: "clapperboard",
    title: "Main tabs",
    bullets: [
      {
        marks: [
          { strong: "Home / For You" },
          {
            text: " — scroll videos. Tap a creator to open their profile. Like, comment, save, share, and duet from the side controls.",
          },
        ],
      },
      {
        marks: [
          { strong: "Friends" },
          { text: " — people you follow and friend activity, including stories when available." },
        ],
      },
      {
        marks: [
          { strong: "Create (+)" },
          { text: " — open the camera to record a clip, add sound, filters, then post or share as a story." },
        ],
      },
      { marks: [{ strong: "Inbox" }, { text: " — messages, activity, and invite alerts." }] },
      {
        marks: [
          { strong: "Profile" },
          { text: " — your videos, likes, followers, settings, shop entry points, and creator tools." },
        ],
      },
      {
        marks: [
          { strong: "Live Discover" },
          { text: " — browse who is live now and tap to join as a spectator." },
        ],
      },
    ],
  },
  {
    icon: "video",
    title: "Videos, sound & duets",
    bullets: [
      { text: "Record or upload a clip from Create / Upload. Add a caption and hashtags before you post." },
      {
        marks: [
          { strong: "Add sound" },
          {
            text: " — open Add sound, tap Play to preview a licensed track, then Use to attach it. Original Sound keeps your mic audio. No audio posts without sound.",
          },
        ],
      },
      {
        marks: [
          { strong: "Duet" },
          { text: " — from a video, start a duet. Choose " },
          { em: "Split" },
          { text: " (half and half) or " },
          { em: "On top" },
          { text: " (full original with your face over it), then record and post." },
        ],
      },
      { text: "Mute all sounds anytime in Settings if you want a silent feed." },
    ],
  },
  {
    icon: "radio",
    title: "Going LIVE & watching",
    bullets: [
      {
        marks: [
          { strong: "Start LIVE" },
          { text: " from Create / Live. Viewers join from Live Discover or your share link." },
        ],
      },
      {
        text: "Spectators can chat, like, send gifts, follow, open ranking capsules, and join engagement activities while the stream runs.",
      },
      {
        marks: [
          { strong: "Co-host" },
          {
            text: " — invite a spectator from Join requests & Spectators, or accept when someone requests to join. Accept / Reject live in that panel (not a separate popup).",
          },
        ],
      },
      {
        marks: [
          { strong: "Poll" },
          { text: " — creators can run a live poll; viewers vote from the live controls." },
        ],
      },
      {
        marks: [{ strong: "Share" }, { text: " — invite friends into the room from the share panel." }],
      },
    ],
  },
  {
    icon: "swords",
    title: "Battles (PK)",
    bullets: [
      {
        text: "Creators invite another live creator into a timed battle. Scores rise from gifts and allowed battle taps.",
      },
      {
        text: "The red / blue bar shows team scores. Tap the bar to hide it so you can focus on the battle video and chat; tap the VS timer to show scores again.",
      },
      {
        text: "Empty opponent slots show Add creator / invite. When someone joins, both cameras appear side by side (or 4-player when more join).",
      },
      {
        marks: [
          { strong: "Battle Energy" },
          { text: " boosts battle play — it never creates Diamonds or real money." },
        ],
      },
    ],
  },
  {
    icon: "gift",
    title: "Gifts, coins & shop",
    bullets: [
      {
        marks: [
          { strong: "Coins (in the app)" },
          {
            text: " — buy with Google Play / Apple in-app purchase on mobile. Used for gifts and in-app digital spend.",
          },
        ],
      },
      {
        marks: [
          { strong: "Shop" },
          {
            text: " — physical / shop checkout uses Stripe on web-style shop flows only. Shop is separate from in-app coin IAP.",
          },
        ],
      },
      {
        marks: [
          { strong: "Test coins" },
          {
            text: " (if shown in non-store builds) are fake and only for testing gift UI — never real balance or revenue.",
          },
        ],
      },
      {
        text: "Only gifts paid with real purchased coins create creator earnings. Free, starter, promotional, bonus, QA and test coins create £0 creator payout.",
      },
      { text: "Creators manage payout from Settings → Creator payout when eligible." },
    ],
  },
  {
    icon: "banknote",
    title: "Creator monetisation (how you earn)",
    paragraphs: [
      [
        { text: "Creators receive " },
        { strong: "60% of eligible net gift and creator-subscription revenue" },
        {
          text: " received by Elix Star Live after applicable store fees, taxes, refunds, chargebacks and processing deductions. Elix Star Live keeps 40% of that net revenue.",
        },
      ],
    ],
    bullets: [
      {
        marks: [
          { strong: "Paid gifts" },
          {
            text: " — earnings go pending first, then become available after the settlement window. Withdrawals need verification and admin review.",
          },
        ],
      },
      {
        marks: [
          { strong: "Creator subscriptions" },
          {
            text: " — when a fan subscribes to you with a verified paid purchase, the same 60/40 net split applies. Benefits (badge, exclusive content, etc.) are decided by the backend entitlement status.",
          },
        ],
      },
      {
        marks: [
          { strong: "Promote Video" },
          {
            text: " — paid ads sold by Elix Star Live. Creators receive 0% of Promote revenue; it is platform advertising income only.",
          },
        ],
      },
      {
        marks: [
          { strong: "Creator Rewards (video views)" },
          { text: " — a separate monthly programme for large numbers of " },
          { em: "qualified unique views" },
          {
            text: ". One valid user can create only one qualified view per video. Watching the same video many times does not multiply rewards. Eligibility (followers, recent views, country, originality, anti-fraud) is enforced by the server. Monthly rewards follow published milestones up to a £1,000 maximum per creator per period.",
          },
        ],
      },
      {
        text: "Likes, comments, follows, profile views and live joins are engagement metrics. They do not pay money by themselves. Live earnings come from paid gifts and subscriptions during streams.",
      },
      {
        text: "Refunds and chargebacks reverse related creator and platform shares via ledger entries. Money already withdrawn may create a recoverable balance under platform terms.",
      },
    ],
    footer:
      "Video rewards use qualified unique views. Repeated watches by the same user do not create additional qualified reward views. Full payout rules and balances: Settings → Creator payout.",
  },
  {
    icon: "star",
    title: "Engagement Hub",
    paragraphs: [
      [
        {
          text: "Open Engagement Hub from Settings or live engagement entry points. Battle continues behind the panel when you open it from LIVE.",
        },
      ],
    ],
    bullets: [
      {
        marks: [
          { strong: "Daily / Weekly Missions" },
          { text: " — complete goals and claim rewards (Goals & claims)." },
        ],
      },
      {
        marks: [{ strong: "Treasure Hunt" }, { text: " — find hidden chests for engagement rewards." }],
      },
      { marks: [{ strong: "Sticker Collection" }, { text: " — complete sticker sets." }] },
      { marks: [{ strong: "Creator Collections" }, { text: " — collectible creator cards." }] },
      {
        marks: [{ strong: "Fan Level" }, { text: " — earn XP and climb fan tiers (e.g. Bronze Fan)." }],
      },
      { marks: [{ strong: "MVP Leaderboard" }, { text: " — LIVE / Today / Week top supporters." }] },
      {
        marks: [{ strong: "Battle Energy" }, { text: " — boost Fan Energy for battles; not Diamonds." }],
      },
      { marks: [{ strong: "Achievements" }, { text: " — permanent unlocks for milestones." }] },
      { marks: [{ strong: "Daily Login" }, { text: " — 7-day streak rewards." }] },
      {
        marks: [
          { strong: "Reward Wallet" },
          {
            text: " — separated balances (promo, energy, XP, purchased) so they stay clear and do not mix with real cash incorrectly.",
          },
        ],
      },
    ],
    footer: "Hub stats (Promo, Energy, XP, Fan Level) update as you watch, gift, complete missions, and claim daily login.",
  },
  {
    icon: "crown",
    title: "Ranking & membership",
    bullets: [
      {
        marks: [
          { text: "Live capsules such as " },
          { strong: "Diamond League" },
          { text: ", " },
          { strong: "Weekly Ranking" },
          { text: ", and " },
          { strong: "Membership VIP" },
          { text: " open ranking or membership panels from the live header." },
        ],
      },
      {
        marks: [
          { strong: "Top 99 / Weekly Ranking" },
          {
            text: " (Explore) ranks creators by real paid-coin gifts received this week. Test coins, starter coins, and promotional coins do not add to Top 99.",
          },
        ],
      },
      {
        marks: [
          { strong: "Private account" },
          {
            text: " — if your account is set to private, you do not appear on Top 99, and gifts you send as a private gifter do not add to Top 99 scores or levels. Public paid gifts from non-private accounts still count toward ranking when they create real creator earnings.",
          },
        ],
      },
      {
        marks: [
          { strong: "Rising Stars" },
          { text: " — challenges and creator spotlight programs when available from Discover / Rising Stars." },
        ],
      },
      {
        marks: [
          { strong: "+ Join / Follow" },
          { text: " on a live — follow the host so you see them again in Friends / Following." },
        ],
      },
    ],
  },
  {
    icon: "users",
    title: "Social & inbox",
    bullets: [
      { text: "Follow creators, open follower / following lists from profiles." },
      { text: "Chat in Inbox threads; battle and co-host invites appear as actionable alerts." },
      { text: "Block accounts from Settings → Blocked accounts. Report abuse from video / live menus." },
    ],
  },
  {
    icon: "shield",
    title: "Safety & account",
    bullets: [
      { text: "Read Community Guidelines, Terms, and Privacy from Settings." },
      { text: "Safety Center covers blocking, reporting, and community rules." },
      { text: "Security settings manage password / account security." },
      { text: "Help & Support answers common questions and contact paths." },
      { text: "You can log out or delete your account from Settings." },
    ],
  },
  {
    icon: "heart",
    title: "Quick tips",
    bullets: [
      { text: "Always preview a song with Play before Use if you want to hear it first." },
      { text: "During battle, hide the score bar when you want more chat space." },
      {
        text: "Engagement rewards are digital (XP, energy, promo) — not cash withdrawals unless you use official creator payout where eligible.",
      },
      { text: "If something fails to load, pull to refresh Live Discover or reopen the room." },
    ],
  },
];

export const HOW_IT_WORKS_SECTION_TITLES = HOW_IT_WORKS_SECTIONS.map((section) => section.title);

export function howItWorksBulletText(bullet: HowItWorksBullet): string {
  if (bullet.text) return bullet.text;
  return (bullet.marks ?? []).map((mark) => mark.strong ?? mark.em ?? mark.text ?? "").join("");
}

export function howItWorksParagraphText(marks: readonly HowItWorksMark[]): string {
  return marks.map((mark) => mark.strong ?? mark.em ?? mark.text ?? "").join("");
}
