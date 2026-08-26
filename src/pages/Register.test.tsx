import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Register from "./Register";

const signUpWithPassword = vi.fn();
const authSaveConsent = vi.fn();
const showToast = vi.fn();

vi.mock("@/store/useAuthStore", () => ({
  useAuthStore: (selector: (state: { signUpWithPassword: typeof signUpWithPassword }) => unknown) =>
    selector({ signUpWithPassword }),
}));

vi.mock("@/features/auth/authSession", () => ({
  authSaveConsent: (...args: unknown[]) => authSaveConsent(...args),
}));

vi.mock("@/lib/toast", () => ({
  showToast: (message: string) => showToast(message),
}));

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function fillRegister(
  page: HTMLElement,
  values: { email: string; password: string; confirm?: string; username?: string },
): void {
  const emailInput = page.querySelector('input[autocomplete="email"]') as HTMLInputElement;
  const passwordInputs = page.querySelectorAll('input[autocomplete="new-password"]');
  const usernameInput = page.querySelector('input[autocomplete="username"]') as HTMLInputElement;
  act(() => {
    if (values.username) setInputValue(usernameInput, values.username);
    setInputValue(emailInput, values.email);
    setInputValue(passwordInputs[0] as HTMLInputElement, values.password);
    setInputValue(passwordInputs[1] as HTMLInputElement, values.confirm ?? values.password);
  });
}

function acceptTerms(page: HTMLElement): void {
  const box = page.querySelector('[role="checkbox"]') as HTMLElement;
  act(() => {
    box.click();
  });
}

function submitForm(page: HTMLElement): void {
  const button = page.querySelector('button[type="submit"]') as HTMLButtonElement;
  act(() => {
    button.click();
  });
}

function renderRegister(from?: string): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <MemoryRouter initialEntries={[{ pathname: "/register", state: from ? { from } : undefined }]}>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<div>login-destination</div>} />
          <Route path="/inbox" element={<div>inbox-destination</div>} />
          <Route path="/" element={<div>root-destination</div>} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

describe("PAGE-002 Register", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  beforeEach(() => {
    signUpWithPassword.mockReset();
    authSaveConsent.mockReset();
    showToast.mockReset();
    authSaveConsent.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it("renders approved register chrome", () => {
    const mounted = renderRegister();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    expect(page.querySelector("h1")?.textContent).toBe("Create Account");
    expect(page.querySelector(".elix-auth-form")?.parentElement?.className).not.toContain("elix-page-glass");
    expect(page.querySelector('img[alt="Elix Star Live"]')).toBeTruthy();
    expect(page.querySelector('img[alt="Elix Star Live"]')?.className).toContain("w-20");
    expect(page.textContent).toContain("Username (optional)");
    expect(page.textContent).toContain("Confirm Password");
    expect(page.textContent).toContain("Create account");
    expect(page.textContent).toContain("Already have an account? Sign in");
    expect(page.textContent).toContain("I confirm I am at least 13 years old");
    expect(page.querySelector('a[href="/terms"]')).toBeTruthy();
    expect(page.querySelector('a[href="/privacy"]')).toBeTruthy();
  });

  it("blocks submit without terms", async () => {
    const mounted = renderRegister();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    fillRegister(page, { email: "andrei@example.com", password: "password12" });
    await act(async () => {
      submitForm(page);
    });
    expect(signUpWithPassword).not.toHaveBeenCalled();
    expect(page.textContent).toContain("You must accept the Terms of Service and Privacy Policy to continue.");
  });

  it("blocks short password and mismatch before the API", async () => {
    const mounted = renderRegister();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    acceptTerms(page);
    fillRegister(page, { email: "andrei@example.com", password: "short" });
    await act(async () => {
      submitForm(page);
    });
    expect(signUpWithPassword).not.toHaveBeenCalled();
    expect(page.textContent).toContain("Password must be at least 8 characters.");
    fillRegister(page, { email: "andrei@example.com", password: "password12", confirm: "password13" });
    await act(async () => {
      submitForm(page);
    });
    expect(signUpWithPassword).not.toHaveBeenCalled();
    expect(page.textContent).toContain("Passwords do not match.");
  });

  it("blocks duplicate submit and stays on the page when confirmation is required", async () => {
    let resolveSignUp: ((value: { error: string | null; needsEmailConfirmation?: boolean; welcomeMessage?: string }) => void) | undefined;
    signUpWithPassword.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSignUp = resolve;
        }),
    );
    const mounted = renderRegister();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    acceptTerms(page);
    fillRegister(page, { email: "andrei@example.com", password: "password12", username: "andrei" });
    submitForm(page);
    submitForm(page);
    expect(signUpWithPassword).toHaveBeenCalledTimes(1);
    expect(page.textContent).toContain("Creating account...");
    await act(async () => {
      resolveSignUp?.({
        error: null,
        needsEmailConfirmation: true,
        welcomeMessage: "Please check your email to confirm your account.",
      });
    });
    expect(authSaveConsent).not.toHaveBeenCalled();
    expect(page.textContent).toContain("Please check your email to confirm your account.");
    expect(page.textContent).toContain("Create account");
  });

  it("navigates after success and shows the starter welcome toast", async () => {
    signUpWithPassword.mockResolvedValue({
      error: null,
      needsEmailConfirmation: false,
      welcomeMessage: "Welcome! You received 50,000 Starter Coins to explore gifts and support creators.",
    });
    const mounted = renderRegister("/inbox");
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    acceptTerms(page);
    fillRegister(page, { email: "andrei@example.com", password: "password12" });
    await act(async () => {
      submitForm(page);
    });
    expect(authSaveConsent).toHaveBeenCalledTimes(1);
    expect(authSaveConsent).toHaveBeenCalledWith("andrei@example.com");
    expect(showToast).toHaveBeenCalledWith(
      "Welcome! You received 50,000 Starter Coins to explore gifts and support creators.",
    );
    expect(page.textContent).toContain("inbox-destination");
  });

  it("opens Sign in with the current from state", () => {
    const mounted = renderRegister("/inbox");
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    const signIn = page.querySelector('a[href="/login"]') as HTMLAnchorElement;
    act(() => {
      signIn.click();
    });
    expect(page.textContent).toContain("login-destination");
  });

  it("clears a previous error on retry", async () => {
    signUpWithPassword
      .mockResolvedValueOnce({ error: "An account with this email already exists." })
      .mockResolvedValueOnce({ error: null, needsEmailConfirmation: false, welcomeMessage: "Welcome! You received 50,000 Starter Coins to explore gifts and support creators." });
    const mounted = renderRegister();
    root = mounted.root;
    container = mounted.container;
    const page = mounted.container;
    acceptTerms(page);
    fillRegister(page, { email: "andrei@example.com", password: "password12" });
    await act(async () => {
      submitForm(page);
    });
    expect(page.textContent).toContain("An account with this email already exists.");
    await act(async () => {
      submitForm(page);
    });
    expect(page.textContent).not.toContain("An account with this email already exists.");
    expect(page.textContent).toContain("root-destination");
  });
});
