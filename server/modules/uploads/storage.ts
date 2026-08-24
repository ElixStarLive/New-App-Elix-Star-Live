import { AppError } from "../../middleware/errors.js";
import { bunnyDelete, bunnyUpload } from "../../infra/bunny.js";
import { storagePathBelongsToUser } from "../../../shared/uploadContract.js";

export function assertOwnedStoragePath(storagePath: string, userId: string): void {
  if (storagePath.includes("..") || storagePath.includes("\\") || storagePath.startsWith("/")) {
    throw new AppError("validation_error", "Invalid storage path", 400);
  }
  if (!storagePathBelongsToUser(storagePath, userId)) {
    throw new AppError("forbidden", "You can only upload to your own storage path.", 403);
  }
}

export async function putOwnedMedia(
  userId: string,
  storagePath: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  assertOwnedStoragePath(storagePath, userId);
  return bunnyUpload(storagePath, body, contentType);
}

export async function deleteOwnedMedia(userId: string, storagePath: string): Promise<void> {
  assertOwnedStoragePath(storagePath, userId);
  await bunnyDelete(storagePath);
}
