import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type DialogKind = "confirm" | "prompt";

type DialogRequest = {
  type: DialogKind;
  title: string;
  message: string;
  defaultValue?: string;
};

type DialogState = DialogRequest & {
  resolve: (value: boolean | string | null) => void;
};

let showDialog: ((request: DialogRequest) => Promise<boolean | string | null>) | null = null;

export function nativeConfirm(message: string, title = "Confirm"): Promise<boolean> {
  if (!showDialog) return Promise.resolve(window.confirm(message));
  return showDialog({ type: "confirm", title, message }) as Promise<boolean>;
}

export function nativePrompt(message: string, defaultValue = "", title = ""): Promise<string | null> {
  if (!showDialog) return Promise.resolve(window.prompt(message, defaultValue));
  return showDialog({ type: "prompt", title, message, defaultValue }) as Promise<string | null>;
}

export function NativeDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    showDialog = (request) =>
      new Promise((resolve) => {
        setDialog({ ...request, resolve });
        if (request.type === "prompt") setInputValue(request.defaultValue || "");
      });
    return () => {
      showDialog = null;
    };
  }, []);

  const handleConfirm = useCallback(() => {
    if (!dialog) return;
    if (dialog.type === "confirm") dialog.resolve(true);
    else dialog.resolve(inputValue);
    setDialog(null);
  }, [dialog, inputValue]);

  const handleCancel = useCallback(() => {
    if (!dialog) return;
    if (dialog.type === "confirm") dialog.resolve(false);
    else dialog.resolve(null);
    setDialog(null);
  }, [dialog]);

  return (
    <>
      {children}
      {dialog ? (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 px-6"
          onClick={(event) => {
            if (event.target === event.currentTarget) handleCancel();
          }}
        >
          <div
            className="w-full max-w-[320px] bg-[rgba(0,0,0,0.35)] rounded-2xl overflow-hidden shadow-2xl border border-white/10"
            role="alertdialog"
            aria-modal="true"
          >
            {dialog.title ? (
              <div className="px-5 pt-5 pb-2">
                <h3 className="text-white font-bold text-base text-center">{dialog.title}</h3>
              </div>
            ) : null}
            <div className="px-5 pb-4 pt-1">
              <p className="text-white/70 text-sm text-center leading-relaxed">{dialog.message}</p>
            </div>
            {dialog.type === "prompt" ? (
              <div className="px-5 pb-4">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleConfirm();
                  }}
                  className="w-full px-3 py-2.5 bg-black/40 border border-white/20 rounded-xl text-white text-sm placeholder:text-white/30 outline-none focus:border-[#D8D9DD]/60"
                  autoFocus
                />
              </div>
            ) : null}
            <div className="flex border-t border-white/10">
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 py-3.5 text-white/60 text-sm font-medium active:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <div className="w-px bg-white/10" />
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 py-3.5 text-[#F5F5F7] text-sm font-bold active:bg-white/5 transition-colors"
              >
                {dialog.type === "confirm" ? "Confirm" : "OK"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
