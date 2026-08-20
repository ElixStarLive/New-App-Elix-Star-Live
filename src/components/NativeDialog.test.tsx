import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { NativeDialogProvider, nativeConfirm, nativePrompt } from "./NativeDialog";

function renderHost(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <NativeDialogProvider>
        <div>shell</div>
      </NativeDialogProvider>,
    );
  });
  return { container, root };
}

describe("PAGE-006 NativeDialog", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it("hosts confirm at the global overlay layer", async () => {
    const mounted = renderHost();
    root = mounted.root;
    container = mounted.container;
    let result: boolean | undefined;
    act(() => {
      void nativeConfirm("Delete this?", "Confirm").then((value) => {
        result = value;
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mounted.container.querySelector('[role="alertdialog"]')).toBeTruthy();
    expect(mounted.container.textContent).toContain("Delete this?");
    const overlay = mounted.container.querySelector(".z-\\[99999\\]") as HTMLElement | null;
    expect(overlay?.className).toContain("z-[99999]");
    const confirm = [...mounted.container.querySelectorAll("button")].find((button) => button.textContent === "Confirm");
    act(() => {
      confirm?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result).toBe(true);
  });

  it("returns prompt text on OK", async () => {
    const mounted = renderHost();
    root = mounted.root;
    container = mounted.container;
    let result: string | null | undefined;
    act(() => {
      void nativePrompt("Name", "Ada", "Rename").then((value) => {
        result = value;
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    const input = mounted.container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("Ada");
    const ok = [...mounted.container.querySelectorAll("button")].find((button) => button.textContent === "OK");
    act(() => {
      ok?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result).toBe("Ada");
  });
});
