import { describe, expect, it } from "vitest";
import {
  CREATOR_SAVED_ACCOUNTS_KEY,
  CREATOR_SAVE_PREF_KEY,
  CREATOR_SAVED_ACCOUNT_LIMIT,
  clearAllLegacyCreatorLoginKeys,
  readCreatorSavedAccounts,
  upsertCreatorSavedAccount,
  writeCreatorSavePref,
  writeCreatorSavedAccounts,
  type CreatorAccountStorage,
} from "./creatorSavedAccounts";

function memoryStorage(seed: Record<string, string> = {}): CreatorAccountStorage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe("PAGE-029 saved creator identifiers", () => {
  it("stores identifier username avatar only and never keeps a password field", () => {
    const storage = memoryStorage();
    writeCreatorSavedAccounts(storage, [
      { identifier: "a@example.com", username: "alpha", avatar: "https://cdn.example/a.png" },
    ]);
    const raw = JSON.parse(storage.getItem(CREATOR_SAVED_ACCOUNTS_KEY) || "[]") as Array<Record<string, unknown>>;
    expect(raw[0]).toEqual({
      identifier: "a@example.com",
      username: "alpha",
      avatar: "https://cdn.example/a.png",
    });
    expect(raw[0]?.password).toBeUndefined();
    expect(storage.getItem("creator_saved_password")).toBeNull();
  });

  it("does not absorb legacy keys into the NEW store", () => {
    const storage = memoryStorage();
    const first = Array.from({ length: 5 }, (_, index) => ({
      identifier: `user${index}@example.com`,
      username: `user${index}`,
    }));
    writeCreatorSavedAccounts(storage, first);
    storage.setItem("creator_saved_identifier", "legacy@example.com");
    storage.setItem("creator_saved_username", "legacy");
    storage.setItem("creator_saved_password", "secret-must-die");
    storage.setItem("creator_save_password", "true");
    const listed = readCreatorSavedAccounts(storage);
    expect(listed.map((row) => row.identifier)).toEqual(first.map((row) => row.identifier));
    expect(listed).toHaveLength(CREATOR_SAVED_ACCOUNT_LIMIT);
    expect(JSON.stringify(listed)).not.toMatch(/legacy@example.com/);
    expect(JSON.stringify(listed)).not.toMatch(/secret-must-die/);
  });

  it("clearAllLegacyCreatorLoginKeys deletes OLD keys without reading them", () => {
    const storage = memoryStorage({
      creator_saved_identifier: "bridge@example.com",
      creator_saved_username: "bridge",
      creator_saved_password: "nope",
      creator_save_password: "true",
      login_saved_password: "login-secret",
    });
    clearAllLegacyCreatorLoginKeys(storage);
    expect(storage.getItem("creator_saved_identifier")).toBeNull();
    expect(storage.getItem("creator_saved_username")).toBeNull();
    expect(storage.getItem("creator_saved_password")).toBeNull();
    expect(storage.getItem("creator_save_password")).toBeNull();
    expect(storage.getItem("login_saved_password")).toBeNull();
    expect(readCreatorSavedAccounts(storage)).toEqual([]);
  });

  it("strips password fields and enforces max 5 with case-insensitive dedupe", () => {
    const storage = memoryStorage({
      [CREATOR_SAVED_ACCOUNTS_KEY]: JSON.stringify([
        { identifier: "One@example.com", username: "one", password: "die" },
        { identifier: "one@example.com", username: "one-dup" },
        { identifier: "two@example.com", username: "two" },
        { identifier: "three@example.com", username: "three" },
        { identifier: "four@example.com", username: "four" },
        { identifier: "five@example.com", username: "five" },
        { identifier: "six@example.com", username: "six" },
      ]),
    });
    const listed = readCreatorSavedAccounts(storage);
    expect(listed).toHaveLength(5);
    expect(listed.map((row) => row.identifier)).toEqual([
      "One@example.com",
      "two@example.com",
      "three@example.com",
      "four@example.com",
      "five@example.com",
    ]);
    expect(JSON.stringify(listed)).not.toMatch(/password|die|six@/);
    expect(storage.getItem(CREATOR_SAVED_ACCOUNTS_KEY)).not.toMatch(/password|die/);
  });

  it("recovers corrupt storage to an empty list", () => {
    const storage = memoryStorage({ [CREATOR_SAVED_ACCOUNTS_KEY]: "{not-json" });
    expect(readCreatorSavedAccounts(storage)).toEqual([]);
    expect(storage.getItem(CREATOR_SAVED_ACCOUNTS_KEY)).toBeNull();
  });

  it("upserts to the front and can persist the save preference without a password", () => {
    const storage = memoryStorage();
    upsertCreatorSavedAccount(storage, { identifier: "one@example.com", username: "one" });
    upsertCreatorSavedAccount(storage, { identifier: "two@example.com", username: "two" });
    const listed = readCreatorSavedAccounts(storage);
    expect(listed.map((row) => row.identifier)).toEqual(["two@example.com", "one@example.com"]);
    writeCreatorSavePref(storage, true);
    expect(storage.getItem(CREATOR_SAVE_PREF_KEY)).toBe("true");
  });
});
