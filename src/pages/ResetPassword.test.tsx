import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResetPassword from "./ResetPassword";

const authResetPassword = vi.fn();

vi.mock("@/features/auth/authSession", () => ({
  authResetPassword: (token: string, password: string) => authResetPassword(token, password),
}));

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function fillPasswords(page: HTMLElement, password: string, confirm = password): void {
  const inputs = page.querySelectorAll('input[autocomplete="new-password"]');
  act(() => {
    setInputValue(inputs[0] as HTMLInputElement, password);
    setInputValue(inputs[1] as HTMLInputElement, confirm);
  });
}

function renderReset(search = "?token=fresh-reset-token-value"): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    window.history.replaceState({}, "", `/reset-password${search}`);
    root.render(
      <MemoryRouter initialEntries={[`/reset-password${search}`]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/login" element={<div>login-destination</div>} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

describe("PAGE-005 Reset Password", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    authResetPassword.mockReset();
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
    container = undefined;
    vi.useRealTimers();
    window.history.replaceState({}, "", "/");
  });

  it("renders OLD chrome without a logo or visibility toggles", () => {
    const mounted = renderReset();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    expect(page.querySelector("h1")?.textContent).toBe("Reset Password");
    expect(page.textContent).toContain("Enter your new password below.");
    expect(page.textContent).toContain("New Password");
    expect(page.textContent).toContain("Confirm Password");
    expect(page.querySelectorAll('input[autocomplete="new-password"]').length).toBe(2);
    expect(page.querySelector('button[type="submit"]')?.textContent).toBe("Reset Password");
    expect(page.querySelector('img[src="/elix-logo.png"]')).toBeNull();
    expect(page.querySelector('button[type="button"]')).toBeNull();
  });

  it("does not submit when the token is missing", async () => {
    const mounted = renderReset("");
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    expect(page.textContent).toContain("Invalid or missing reset link. Please request a new password reset.");
    fillPasswords(page, "password12");
    await act(async () => {
      (page.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    });
    expect(authResetPassword).not.toHaveBeenCalled();
  });

  it("rejects a short password and a mismatch before the API", async () => {
    const mounted = renderReset();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    fillPasswords(page, "short");
    await act(async () => {
      (page.querySelector("form") as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(page.textContent).toContain("Password must be at least 8 characters.");
    expect(authResetPassword).not.toHaveBeenCalled();

    fillPasswords(page, "password12", "password99");
    await act(async () => {
      (page.querySelector("form") as HTMLFormElement).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(page.textContent).toContain("Passwords do not match.");
    expect(authResetPassword).not.toHaveBeenCalled();
  });

  it("shows success and redirects to Login without creating a session", async () => {
    vi.useFakeTimers();
    authResetPassword.mockResolvedValue({ ok: true });
    const mounted = renderReset("?token=fresh-reset-token-value");
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    fillPasswords(page, "password12");
    await act(async () => {
      (page.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    });
    expect(authResetPassword).toHaveBeenCalledWith("fresh-reset-token-value", "password12");
    expect(page.textContent).toContain("Password Reset!");
    expect(page.textContent).toContain("Your password has been updated. Redirecting to login...");
    expect(page.querySelector('input[autocomplete="new-password"]')).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(page.textContent).toContain("login-destination");
  });

  it("surfaces network and server errors without a success state", async () => {
    authResetPassword.mockRejectedValue(new Error("offline"));
    const mounted = renderReset();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    fillPasswords(page, "password12");
    await act(async () => {
      (page.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    });
    expect(page.textContent).toContain("Failed to reset password. Please try again.");
    expect(page.textContent).not.toContain("Password Reset!");

    authResetPassword.mockResolvedValue({ ok: false, error: "This reset link has expired." });
    await act(async () => {
      (page.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    });
    expect(page.textContent).toContain("This reset link has expired.");
    expect(page.textContent).not.toContain("Password Reset!");
  });

  it("blocks a second submit until the first request finishes", async () => {
    let resolveReset: ((value: { ok: true }) => void) | undefined;
    authResetPassword.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveReset = resolve;
        }),
    );
    const mounted = renderReset();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    fillPasswords(page, "password12");
    const button = page.querySelector('button[type="submit"]') as HTMLButtonElement;
    act(() => {
      button.click();
      button.click();
    });
    expect(authResetPassword).toHaveBeenCalledTimes(1);
    expect(button.textContent).toBe("Updating...");
    expect(button.disabled).toBe(true);
    await act(async () => {
      resolveReset?.({ ok: true });
    });
    expect(page.textContent).toContain("Password Reset!");
  });
});
