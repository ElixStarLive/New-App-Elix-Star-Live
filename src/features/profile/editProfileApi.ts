import { profileEditUserSchema, profilePatchBodySchema, type ProfileEditUser, type ProfilePatchBody } from "@shared/contracts";
import { apiRequest } from "@/lib/apiClient";
import { isRecord } from "@/lib/isRecord";
import { apiUploadOwnAvatar } from "./ownProfileApi";

export type { ProfileEditUser, ProfilePatchBody };

export const EDIT_USERNAME_RE = /^[a-zA-Z0-9._]{3,30}$/;
export const EDIT_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const EDIT_AVATAR_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export function normalizeEditUsername(value: string): string {
  return value.replace(/^@+/, "").replace(/\s+/g, "");
}

export function editUsernameError(username: string): string | null {
  const next = normalizeEditUsername(username).trim();
  if (!next) return "Username is required";
  if (!EDIT_USERNAME_RE.test(next)) return "Username: 3–30 letters, numbers, . or _";
  return null;
}

export function editAvatarFileError(file: File): string | null {
  const type = (file.type || "").toLowerCase();
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const typeOk = EDIT_AVATAR_TYPES.has(type) || (!type && ["jpg", "jpeg", "png", "webp"].includes(ext));
  if (!typeOk) return "Invalid file type. Please use JPG, PNG, or WebP.";
  if (file.size > EDIT_AVATAR_MAX_BYTES) return "File too large. Please use an image under 5 MB.";
  return null;
}

export async function apiFetchEditProfile(): Promise<{
  profile: ProfileEditUser | null;
  error: string | null;
  status?: number;
}> {
  const { data, error } = await apiRequest<unknown>("/api/profiles/me");
  if (error) return { profile: null, error: error.message, status: error.status };
  const parsed = profileEditUserSchema.safeParse(isRecord(data) ? data.user : null);
  if (!parsed.success) return { profile: null, error: "Invalid profile" };
  return { profile: parsed.data, error: null };
}

export async function apiSaveEditProfile(body: ProfilePatchBody): Promise<{
  profile: ProfileEditUser | null;
  error: string | null;
  status?: number;
}> {
  const parsed = profilePatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return { profile: null, error: parsed.error.issues[0]?.message ?? "Invalid profile", status: 400 };
  }
  const { data, error } = await apiRequest<unknown>("/api/profiles/me", {
    method: "PATCH",
    body: JSON.stringify(parsed.data),
  });
  if (error) return { profile: null, error: error.message, status: error.status };
  const user = profileEditUserSchema.safeParse(isRecord(data) ? data.user : null);
  if (!user.success) return { profile: null, error: "Invalid profile", status: 500 };
  return { profile: user.data, error: null };
}

export async function apiUploadEditAvatar(file: Blob, filename = "avatar.jpg"): Promise<{
  avatarUrl: string | null;
  error: string | null;
}> {
  return apiUploadOwnAvatar(file, filename);
}
