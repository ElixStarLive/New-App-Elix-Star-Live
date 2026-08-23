/** Canonical PAGE-060 Legal Hub inventory. Navigation labels and routes only. */

import type { LucideIcon } from "lucide-react";
import {
  BadgeDollarSign,
  Copyright,
  FileText,
  Lock,
  Mail,
  Music,
  Package,
  ShieldAlert,
  Users,
} from "lucide-react";

export const LEGAL_HUB_TITLE = "Legal";
export const LEGAL_HUB_DMCA_CONTACT = "dmca@elixstarlive.com";
export const LEGAL_HUB_SUPPORT_CONTACT = "support@elixstarlive.co.uk";

export type LegalHubItem = {
  label: string;
  path: string;
  icon: LucideIcon;
};

export const LEGAL_HUB_ITEMS: readonly LegalHubItem[] = [
  { label: "Terms & Conditions", path: "/terms", icon: FileText },
  { label: "Privacy Policy", path: "/privacy", icon: Lock },
  { label: "Copyright Notice", path: "/copyright", icon: Copyright },
  { label: "Audio & Music Disclaimer", path: "/legal/audio", icon: Music },
  { label: "UGC Disclaimer", path: "/legal/ugc", icon: Users },
  { label: "Affiliate / Sponsored Disclosure", path: "/legal/affiliate", icon: BadgeDollarSign },
  { label: "Supplier Agreement", path: "/legal/supplier", icon: Package },
  { label: "DMCA / Copyright Report", path: "/legal/dmca", icon: Mail },
  { label: "Safety", path: "/legal/safety", icon: ShieldAlert },
];

export const LEGAL_HUB_LABELS = LEGAL_HUB_ITEMS.map((item) => item.label);
export const LEGAL_HUB_PATHS = LEGAL_HUB_ITEMS.map((item) => item.path);
