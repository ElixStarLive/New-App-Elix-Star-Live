import { nativeConfirm } from "@/components/NativeDialog";
import { authDeleteAccount } from "@/features/auth/authSession";

let logoutInFlight = false;
let deleteInFlight = false;

export function resetSettingsActionLocksForTests(): void {
  logoutInFlight = false;
  deleteInFlight = false;
}

export async function requestSettingsLogout(
  signOut: () => Promise<void>,
): Promise<{ started: true } | { started: false }> {
  if (logoutInFlight) return { started: false };
  logoutInFlight = true;
  try {
    await signOut();
    return { started: true };
  } catch {
    throw new Error("Sign out failed");
  } finally {
    logoutInFlight = false;
  }
}

export async function requestSettingsDeleteAccount(
  signOut: () => Promise<void>,
): Promise<{ cancelled: true } | { cancelled: false; ok: true } | { cancelled: false; ok: false; error: string }> {
  if (deleteInFlight) return { cancelled: false, ok: false, error: "Delete already in progress" };
  deleteInFlight = true;
  try {
    const confirmed = await nativeConfirm("Are you sure you want to delete your account?", "Delete Account");
    if (!confirmed) {
      return { cancelled: true };
    }
    const result = await authDeleteAccount();
    if (!result.ok) {
      return { cancelled: false, ok: false, error: result.error || "Failed to delete account." };
    }
    await signOut();
    return { cancelled: false, ok: true };
  } finally {
    deleteInFlight = false;
  }
}
