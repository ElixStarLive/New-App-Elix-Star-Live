import type { UserPublic } from "@shared/contracts";
import { apiFetchProfile, apiFollow, apiUnfollow } from "@/features/feed/feedApi";
import { apiBlockUser } from "@/features/profile/publicProfileApi";

export function liveProfileErrorCopy(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("404") || m.includes("not found") || m.includes("ended")) return "Profile not found.";
  if (m.includes("403") || m.includes("forbidden") || m.includes("blocked") || m.includes("cannot view")) {
    return "You cannot view this profile.";
  }
  if (m.includes("banned") || m.includes("suspended")) return "This account is not available.";
  return message.trim() || "Could not load profile";
}

export async function loadLiveProfile(args: {
  userId: string;
  generation: number;
  isCurrent: (generation: number) => boolean;
  fetchProfile?: typeof apiFetchProfile;
}): Promise<{ ok: true; profile: UserPublic } | { ok: false; error: string }> {
  const userId = args.userId.trim();
  if (!userId) return { ok: false, error: "Missing user" };
  const fetchProfile = args.fetchProfile ?? apiFetchProfile;
  const result = await fetchProfile(userId);
  if (!args.isCurrent(args.generation)) return { ok: false, error: "stale" };
  if (!result.profile) {
    return { ok: false, error: liveProfileErrorCopy(result.error || "Profile not found.") };
  }
  if (result.profile.id !== userId) {
    return { ok: false, error: "Server returned a different user" };
  }
  return { ok: true, profile: result.profile };
}

export async function toggleLiveProfileFollow(args: {
  userId: string;
  following: boolean;
  isSelf: boolean;
  follow?: typeof apiFollow;
  unfollow?: typeof apiUnfollow;
}): Promise<{ ok: true; following: boolean } | { ok: false; error: string; following: boolean }> {
  if (args.isSelf) return { ok: false, error: "Cannot follow yourself", following: args.following };
  const follow = args.follow ?? apiFollow;
  const unfollow = args.unfollow ?? apiUnfollow;
  const next = !args.following;
  const result = await (next ? follow(args.userId) : unfollow(args.userId));
  if (!result.ok) return { ok: false, error: result.error, following: args.following };
  return { ok: true, following: next };
}

export async function blockLiveProfileUser(args: {
  userId: string;
  isSelf: boolean;
  block?: (userId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (args.isSelf) return { ok: false, error: "Cannot block yourself" };
  const block = args.block ?? apiBlockUser;
  return block(args.userId);
}
