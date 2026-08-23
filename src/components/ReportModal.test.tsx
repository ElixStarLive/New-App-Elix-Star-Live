import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReportModal from "./ReportModal";

const api = vi.hoisted(() => ({
  apiCreateReport: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
const checkUser = vi.hoisted(() => vi.fn(async () => undefined));
const auth = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  checkUser: () => checkUser(),
}));

vi.mock("@/features/report/reportApi", () => api);
vi.mock("@/lib/toast", () => ({ showToast: (...args: unknown[]) => toast(...args) }));
vi.mock("@/store/useAuthStore", () => {
  const useAuthStore = (selector?: (state: typeof auth) => unknown) => (selector ? selector(auth) : auth);
  useAuthStore.getState = () => auth;
  return { useAuthStore };
});

function renderModal(props: { videoId: string; contentType: "video" | "user" | "comment" | "live"; contentId?: string }) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onClose = vi.fn();
  act(() => {
    root.render(
      <ReportModal isOpen onClose={onClose} videoId={props.videoId} contentType={props.contentType} contentId={props.contentId} />,
    );
  });
  return { container, root, onClose };
}

async function waitUntil(predicate: () => boolean, timeout = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error("waitUntil timeout");
}

function modalButton(label: string) {
  return [...document.body.querySelectorAll("button")].find((button) => (button.textContent || "").trim() === label);
}

let root: Root | null = null;

describe("PAGE-046 ReportModal", () => {
  beforeEach(() => {
    api.apiCreateReport.mockReset();
    toast.mockReset();
    checkUser.mockReset();
    auth.user = { id: "11111111-1111-4111-8111-111111111111" };
    api.apiCreateReport.mockResolvedValue({ ok: true, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
  });

  it("renders the video sheet and locks duplicate submit", async () => {
    const hold = new Promise<{ ok: true; id: string }>(() => undefined);
    api.apiCreateReport.mockReturnValueOnce(hold);
    const view = renderModal({ videoId: "video-1", contentType: "video" });
    root = view.root;
    expect(document.body.textContent).toContain("Report video");
    expect(document.body.textContent).toContain("Spam or misleading");
    expect(modalButton("Submit")?.hasAttribute("disabled")).toBe(true);
    act(() => {
      modalButton("Spam or misleading")?.click();
    });
    const submit = modalButton("Submit") as HTMLButtonElement;
    act(() => {
      submit.click();
      submit.click();
    });
    await waitUntil(() => api.apiCreateReport.mock.calls.length === 1);
    expect(document.body.textContent).toContain("Submitting...");
    expect(document.body.textContent).not.toContain("Report Submitted");
    expect(api.apiCreateReport).toHaveBeenCalledWith({
      targetType: "video",
      targetId: "video-1",
      reason: "spam",
      details: "",
    });
  });

  it("reports a user from contentId and shows success without a timer close", async () => {
    const view = renderModal({
      videoId: "",
      contentType: "user",
      contentId: "22222222-2222-4222-8222-222222222222",
    });
    root = view.root;
    expect(document.body.textContent).toContain("Report user");
    act(() => {
      modalButton("Impersonation")?.click();
    });
    act(() => {
      modalButton("Submit")?.click();
    });
    await waitUntil(() => (document.body.textContent || "").includes("Report Submitted"));
    expect(document.body.textContent).toContain("We'll review your report and take appropriate action.");
    expect(view.onClose).not.toHaveBeenCalled();
    expect(api.apiCreateReport).toHaveBeenCalledWith({
      targetType: "user",
      targetId: "22222222-2222-4222-8222-222222222222",
      reason: "impersonation",
      details: "",
    });
  });
});
