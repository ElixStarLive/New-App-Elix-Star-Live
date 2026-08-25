import { userPublicSchema, type UserPublic } from "@shared/contracts";
import { isRecord } from "@/lib/isRecord";

/** NEW contract only: `{ user: UserPublic }` with camelCase fields. No profile/snake dual-read. */
export function decodeUserPublicFromPayload(payload: unknown): UserPublic | null {
  if (!isRecord(payload) || !isRecord(payload.user)) return null;
  const parsed = userPublicSchema.safeParse(payload.user);
  return parsed.success ? parsed.data : null;
}
