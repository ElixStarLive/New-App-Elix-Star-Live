export const CREATOR_SAVED_ACCOUNTS_KEY = "creator_saved_accounts";
export const CREATOR_SAVE_PREF_KEY = "creator_save_login_details";

const LEGACY_IDENTIFIER_KEY = "creator_saved_identifier";
const LEGACY_USERNAME_KEY = "creator_saved_username";
const LEGACY_PASSWORD_KEY = "creator_saved_password";
const LEGACY_SAVE_PASSWORD_KEY = "creator_save_password";

export const CREATOR_SAVED_ACCOUNT_LIMIT = 5;

export type SavedCreatorAccount = {
  identifier: string;
  username: string;
  avatar?: string;
};

export type CreatorAccountStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function browserCreatorAccountStorage(): CreatorAccountStorage {
  if (typeof window === "undefined" || !window.localStorage) {
    return {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    };
  }
  return window.localStorage;
}

export function stripLegacyCreatorPasswordKeys(storage: CreatorAccountStorage): void {
  storage.removeItem(LEGACY_PASSWORD_KEY);
  storage.removeItem(LEGACY_SAVE_PASSWORD_KEY);
}

function asAccount(value: unknown): SavedCreatorAccount | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const identifier = typeof row.identifier === "string" ? row.identifier.trim() : "";
  if (!identifier) return null;
  const usernameRaw = typeof row.username === "string" ? row.username.trim() : "";
  const username = usernameRaw || identifier.split("@")[0] || identifier;
  const avatar = typeof row.avatar === "string" && row.avatar.trim() ? row.avatar.trim() : undefined;
  return avatar ? { identifier, username, avatar } : { identifier, username };
}

export function readCreatorSavedAccounts(storage: CreatorAccountStorage): SavedCreatorAccount[] {
  stripLegacyCreatorPasswordKeys(storage);
  const raw = storage.getItem(CREATOR_SAVED_ACCOUNTS_KEY);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    storage.removeItem(CREATOR_SAVED_ACCOUNTS_KEY);
    return [];
  }
  if (!Array.isArray(parsed)) {
    storage.removeItem(CREATOR_SAVED_ACCOUNTS_KEY);
    return [];
  }
  const accounts: SavedCreatorAccount[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    const account = asAccount(item);
    if (!account || seen.has(account.identifier)) continue;
    seen.add(account.identifier);
    accounts.push(account);
    if (accounts.length >= CREATOR_SAVED_ACCOUNT_LIMIT) break;
  }
  return accounts;
}

export function writeCreatorSavedAccounts(
  storage: CreatorAccountStorage,
  accounts: SavedCreatorAccount[],
): SavedCreatorAccount[] {
  stripLegacyCreatorPasswordKeys(storage);
  const limited = accounts.slice(0, CREATOR_SAVED_ACCOUNT_LIMIT).map((account) => {
    const next: SavedCreatorAccount = {
      identifier: account.identifier,
      username: account.username,
    };
    if (account.avatar) next.avatar = account.avatar;
    return next;
  });
  storage.setItem(CREATOR_SAVED_ACCOUNTS_KEY, JSON.stringify(limited));
  return limited;
}

export function upsertCreatorSavedAccount(
  storage: CreatorAccountStorage,
  account: SavedCreatorAccount,
): SavedCreatorAccount[] {
  const previous = readCreatorSavedAccounts(storage);
  const next = [account, ...previous.filter((row) => row.identifier !== account.identifier)];
  return writeCreatorSavedAccounts(storage, next);
}

export function removeCreatorSavedAccount(
  storage: CreatorAccountStorage,
  identifier: string,
): SavedCreatorAccount[] {
  const next = readCreatorSavedAccounts(storage).filter((row) => row.identifier !== identifier);
  return writeCreatorSavedAccounts(storage, next);
}

export function readCreatorSavePref(storage: CreatorAccountStorage): boolean {
  return storage.getItem(CREATOR_SAVE_PREF_KEY) === "true";
}

export function writeCreatorSavePref(storage: CreatorAccountStorage, enabled: boolean): void {
  storage.setItem(CREATOR_SAVE_PREF_KEY, enabled ? "true" : "false");
}

export function migrateLegacyCreatorLoginKeys(storage: CreatorAccountStorage): SavedCreatorAccount[] {
  stripLegacyCreatorPasswordKeys(storage);
  const accounts = readCreatorSavedAccounts(storage);
  const legacyId = (storage.getItem(LEGACY_IDENTIFIER_KEY) || "").trim();
  const legacyUser = (storage.getItem(LEGACY_USERNAME_KEY) || "").trim();
  let next = accounts;
  if (legacyId && !accounts.some((account) => account.identifier === legacyId)) {
    next = writeCreatorSavedAccounts(storage, [
      { identifier: legacyId, username: legacyUser || legacyId.split("@")[0] || legacyId },
      ...accounts,
    ]);
  }
  storage.removeItem(LEGACY_IDENTIFIER_KEY);
  storage.removeItem(LEGACY_USERNAME_KEY);
  storage.removeItem(LEGACY_PASSWORD_KEY);
  storage.removeItem(LEGACY_SAVE_PASSWORD_KEY);
  return next;
}
