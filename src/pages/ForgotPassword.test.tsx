import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ForgotPassword from "./ForgotPassword";

const authForgotPassword = vi.fn();
const isPasswordResetEnabled = vi.fn(() => true);

vi.mock("@/features/auth/authSession", () => ({
  authForgotPassword: (email: string) => authForgotPassword(email),
}));

vi.mock("@/lib/authFeatures", () => ({
  isPasswordResetEnabled: () => isPasswordResetEnabled(),
}));

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderForgot(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={["/forgot-password"]}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/login" element={<div>login-destination</div>} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

describe("PAGE-004 Forgot Password", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    authForgotPassword.mockReset();
    isPasswordResetEnabled.mockReset();
    isPasswordResetEnabled.mockReturnValue(true);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it("renders OLD chrome without a logo", () => {
    const mounted = renderForgot();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    expect(page.querySelector("h1")?.textContent).toBe("Forgot Password");
    expect(page.textContent).toContain("Enter your email address and we'll send you a link to reset your password.");
    expect(page.textContent).toContain("Back to Login");
    expect(page.textContent).toContain("Email");
    expect(page.querySelector('input[type="email"]')?.getAttribute("placeholder")).toBe("you@email.com");
    expect(page.querySelector('input[type="email"]')?.getAttribute("autocomplete")).toBe("email");
    expect(page.querySelector('button[type="submit"]')?.textContent).toBe("Send Reset Link");
    expect(page.querySelector('img[src="/elix-logo.png"]')).toBeNull();
    expect(page.querySelector('a[href="/login"]')).toBeTruthy();
  });

  it("redirects to Login when password reset is disabled", () => {
    isPasswordResetEnabled.mockReturnValue(false);
    const mounted = renderForgot();
    root = mounted.root;
    container = mounted.container;
    expect(mounted.container.textContent).toContain("login-destination");
    expect(authForgotPassword).not.toHaveBeenCalled();
  });

  it("does not submit while empty", async () => {
    const mounted = renderForgot();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    const form = page.querySelector("form") as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await act(async () => undefined);
    expect(authForgotPassword).not.toHaveBeenCalled();
    expect(page.textContent).toContain("Email is required.");
  });

  it("shows the check-email state without exposing a token or logging in", async () => {
    authForgotPassword.mockResolvedValue({ ok: true });
    const mounted = renderForgot();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    const emailInput = page.querySelector('input[type="email"]') as HTMLInputElement;
    act(() => {
      setInputValue(emailInput, "Andrei@Example.com");
    });
    await act(async () => {
      (page.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    });
    expect(authForgotPassword).toHaveBeenCalledWith("Andrei@Example.com");
    expect(page.textContent).toContain("Check your email");
    expect(page.textContent).toContain("We've sent a password reset link to");
    expect(page.textContent).toContain("Andrei@Example.com");
    expect(page.textContent).not.toContain("token=");
    expect(page.querySelector('input[type="email"]')).toBeNull();
    expect(page.querySelector('a[href="/login"]')?.textContent).toContain("Back to Login");
  });

  it("keeps the form and surfaces network failure", async () => {
    authForgotPassword.mockRejectedValue(new Error("offline"));
    const mounted = renderForgot();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    const emailInput = page.querySelector('input[type="email"]') as HTMLInputElement;
    act(() => {
      setInputValue(emailInput, "andrei@example.com");
    });
    await act(async () => {
      (page.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    });
    expect(page.textContent).toContain("Network error. Please check your connection and try again.");
    expect(page.textContent).not.toContain("Check your email");
    expect(page.querySelector('input[type="email"]')).toBeTruthy();
  });

  it("surfaces rate-limit and mail-not-configured errors without a success state", async () => {
    authForgotPassword.mockResolvedValue({ ok: false, error: "Too many reset requests. Please try again later." });
    const mounted = renderForgot();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    const emailInput = page.querySelector('input[type="email"]') as HTMLInputElement;
    act(() => {
      setInputValue(emailInput, "andrei@example.com");
    });
    await act(async () => {
      (page.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    });
    expect(page.textContent).toContain("Too many reset requests. Please try again later.");
    expect(page.textContent).not.toContain("Check your email");
  });

  it("blocks a second submit until the first request finishes", async () => {
    let resolveForgot: ((value: { ok: true }) => void) | undefined;
    authForgotPassword.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveForgot = resolve;
        }),
    );
    const mounted = renderForgot();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    const emailInput = page.querySelector('input[type="email"]') as HTMLInputElement;
    act(() => {
      setInputValue(emailInput, "andrei@example.com");
    });
    const button = page.querySelector('button[type="submit"]') as HTMLButtonElement;
    act(() => {
      button.click();
      button.click();
    });
    expect(authForgotPassword).toHaveBeenCalledTimes(1);
    expect(button.textContent).toBe("Sending...");
    expect(button.disabled).toBe(true);
    await act(async () => {
      resolveForgot?.({ ok: true });
    });
    expect(page.textContent).toContain("Check your email");
  });

  it("navigates back to Login from the form", () => {
    const mounted = renderForgot();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    act(() => {
      (page.querySelector('a[href="/login"]') as HTMLAnchorElement).click();
    });
    expect(page.textContent).toContain("login-destination");
  });
});
