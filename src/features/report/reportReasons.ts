import type { ReportReason, ReportTargetType } from "@shared/contracts";

export type ReportPageKind = "video" | "user" | "comment";

export type ReportPageReason = {
  id: ReportReason;
  label: string;
};

export const PAGE_REPORT_REASONS: Record<ReportPageKind, ReportPageReason[]> = {
  video: [
    { id: "spam", label: "Spam or misleading" },
    { id: "harassment", label: "Harassment or bullying" },
    { id: "hate_speech", label: "Hate speech" },
    { id: "violence", label: "Violence or dangerous content" },
    { id: "sexual_content", label: "Sexual content" },
    { id: "child_safety", label: "Child safety concerns" },
    { id: "copyright", label: "Copyright violation" },
    { id: "other", label: "Other" },
  ],
  user: [
    { id: "harassment", label: "Harassment or bullying" },
    { id: "impersonation", label: "Impersonation" },
    { id: "spam", label: "Spam account" },
    { id: "underage", label: "Underage user" },
    { id: "other", label: "Other" },
  ],
  comment: [
    { id: "spam", label: "Spam" },
    { id: "harassment", label: "Harassment" },
    { id: "hate_speech", label: "Hate speech" },
    { id: "other", label: "Other" },
  ],
};

export type ReportModalReason = {
  id: ReportReason;
  title: string;
  description: string;
  icon: "alert" | "ban" | "message" | "eye" | "flag" | "user";
  color: string;
};

export const MODAL_REPORT_REASONS: ReportModalReason[] = [
  {
    id: "spam",
    title: "Spam or misleading",
    description: "Promotes scams, fake engagement, or misleading content",
    icon: "alert",
    color: "text-white",
  },
  {
    id: "hate",
    title: "Hate speech or symbols",
    description: "Promotes hatred or violence against individuals or groups",
    icon: "ban",
    color: "text-white/60",
  },
  {
    id: "harassment",
    title: "Harassment or bullying",
    description: "Targets individuals with repeated unwanted contact or abuse",
    icon: "message",
    color: "text-white",
  },
  {
    id: "violence",
    title: "Violent or dangerous acts",
    description: "Promotes or glorifies violence, self-harm, or dangerous activities",
    icon: "alert",
    color: "text-white/70",
  },
  {
    id: "nudity",
    title: "Nudity or sexual content",
    description: "Contains explicit sexual content or nudity",
    icon: "eye",
    color: "text-white",
  },
  {
    id: "copyright",
    title: "Copyright infringement",
    description: "Uses copyrighted material without permission",
    icon: "flag",
    color: "text-white",
  },
  {
    id: "impersonation",
    title: "Impersonation",
    description: "Pretends to be someone else or misrepresents identity",
    icon: "user",
    color: "text-indigo-400",
  },
  {
    id: "other",
    title: "Other issue",
    description: "Something else that violates community guidelines",
    icon: "flag",
    color: "text-white",
  },
];

export type ReportContentType = "video" | "comment" | "user" | "live";

export function pageKindFromType(raw: string): ReportPageKind {
  if (raw === "user" || raw === "support") return "user";
  if (raw === "comment") return "comment";
  return "video";
}

export function parseReportSearch(search: URLSearchParams): {
  contentType: ReportPageKind;
  targetType: ReportTargetType;
  targetId: string;
  isGeneralSupport: boolean;
} {
  const rawType = search.get("type") || search.get("targetKind") || "video";
  const targetId = (search.get("id") || search.get("targetId") || "").trim();
  const isGeneralSupport = rawType === "support" || !targetId;
  const contentType = pageKindFromType(rawType);
  const targetType: ReportTargetType = isGeneralSupport
    ? "support"
    : rawType === "live" || rawType === "message" || rawType === "comment" || rawType === "user" || rawType === "video"
      ? rawType
      : contentType;
  return {
    contentType,
    targetType,
    targetId: isGeneralSupport ? targetId || "support_ticket" : targetId,
    isGeneralSupport,
  };
}

export function contentTypeLabel(contentType: ReportContentType): string {
  if (contentType === "live") return "live stream";
  return contentType;
}

export function reportModalTargetId(
  videoId: string,
  contentType: ReportContentType,
  contentId?: string,
): string {
  return (contentType === "video" ? videoId : contentId || videoId).trim();
}
