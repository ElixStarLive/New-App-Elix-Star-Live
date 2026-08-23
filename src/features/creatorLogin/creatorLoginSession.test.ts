import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCreatorLoginSession } from "./creatorLoginSession";
import {
  CREATOR_SAVED_ACCOUNTS_KEY,
  type CreatorAccountStorage,
} from "./creatorSavedAccounts";

vi.mock("@/features/auth/authSession", () => ({
  authResendConfirmation: vi.fn(),
}));

import { authResendConfirmation } from "@/features/auth/authSession";

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

describe("PAGE-029 creator login session", () => {
  beforeEach(() => {
    vi.mocked(authResendConfirmation).mockReset();
  });

  it("hydrates saved identifiers and clears password on dispose", () => {
    const storage = memoryStorage({
      [CREATOR_SAVED_ACCOUNTS_KEY]: JSON.stringify([
        { identifier: "star@example.com", username: "star" },
      ]),
    });
    const session = createCreatorLoginSession(storage);
    session.hydrate();
    expect(session.getSnapshot().email).toBe("star@example.com");
    session.setPassword("must-not-keep");
    session.dispose();
    expect(session.getSnapshot().password).toBe("");
  });

  it("does not let a late login overwrite a selected account", async () => {
    const storage = memoryStorage({
      [CREATOR_SAVED_ACCOUNTS_KEY]: JSON.stringify([
        { identifier: "a@example.com", username: "a" },
        { identifier: "b@example.com", username: "b" },
      ]),
    });
    const session = createCreatorLoginSession(storage);
    session.hydrate();
    session.setEmail("a@example.com");
    session.setPassword("password12");
    let releaseA: (value: { error: string | null }) => void = () => undefined;
    const first = session.login(
      () =>
        new Promise((resolve) => {
          releaseA = resolve;
        }),
    );
    session.selectAccount("b@example.com");
    releaseA({ error: null });
    await first;
    expect(session.getSnapshot().email).toBe("b@example.com");
    expect(session.getSnapshot().accounts.map((row) => row.identifier)).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
    expect(session.getSnapshot().submitting).toBe(false);
  });

  it("blocks a second login tap while the first is in flight", async () => {
    const session = createCreatorLoginSession(memoryStorage());
    session.hydrate();
    session.setEmail("a@example.com");
    session.setPassword("password12");
    let release: (value: { error: null }) => void = () => undefined;
    const first = session.login(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const second = await session.login(async () => ({ error: null }));
    expect(second).toEqual({ ok: false, error: "busy" });
    release({ error: null });
    await first;
  });

  it("reverts to an error and does not persist an identifier when login fails", async () => {
    const storage = memoryStorage();
    const session = createCreatorLoginSession(storage);
    session.hydrate();
    session.setEmail("a@example.com");
    session.setPassword("bad");
    const res = await session.login(async () => ({ error: "invalid_credentials" }));
    expect(res.ok).toBe(false);
    expect(session.getSnapshot().accounts).toEqual([]);
    expect(storage.getItem(CREATOR_SAVED_ACCOUNTS_KEY)).toBeNull();
  });

  it("selects a saved account without copying a password", () => {
    const storage = memoryStorage({
      [CREATOR_SAVED_ACCOUNTS_KEY]: JSON.stringify([
        { identifier: "one@example.com", username: "one" },
        { identifier: "two@example.com", username: "two" },
      ]),
    });
    const session = createCreatorLoginSession(storage);
    session.hydrate();
    session.setPassword("leftover");
    session.selectAccount("two@example.com");
    expect(session.getSnapshot().email).toBe("two@example.com");
    expect(session.getSnapshot().username).toBe("two");
    expect(session.getSnapshot().password).toBe("");
  });

  it("shows resend only for unconfirmed email, not invalid credentials", async () => {
    const session = createCreatorLoginSession(memoryStorage());
    session.hydrate();
    session.setEmail("a@example.com");
    session.setPassword("bad");
    await session.login(async () => ({ error: "Invalid email or password" }));
    expect(session.getSnapshot().showResend).toBe(false);
    expect(session.getSnapshot().error).toBe("Invalid email or password");

    await session.login(async () => ({ error: "Email not confirmed" }));
    expect(session.getSnapshot().showResend).toBe(true);
    expect(session.getSnapshot().error).toMatch(/Email not confirmed/);
  });

  it("ignores aborted login without surfacing an error", async () => {
    const session = createCreatorLoginSession(memoryStorage());
    session.hydrate();
    session.setEmail("a@example.com");
    session.setPassword("password12");
    const res = await session.login(async () => ({ error: "aborted" }));
    expect(res).toEqual({ ok: false, error: "aborted" });
    expect(session.getSnapshot().error).toBeNull();
    expect(session.getSnapshot().submitting).toBe(false);
  });
});
