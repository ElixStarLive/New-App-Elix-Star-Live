import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import { apiUploadVideo } from "@/features/feed/feedApi";
import { FEED_HOME } from "@/lib/settingsNav";
import { showToast } from "@/lib/toast";

export default function Upload() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const soundId = params.get("sound") || params.get("soundId") || "";
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="page-above-bottom-nav text-white">
      <div className="page-above-bottom-nav__inner flex flex-col min-h-0">
        <header className="flex items-center justify-between px-4 pb-2" style={{ paddingTop: "var(--page-header-top)" }}>
          <span className="w-10" />
          <h1 className="text-[16px] font-bold">Upload</h1>
          <button type="button" onClick={() => navigate(FEED_HOME, { replace: true })} className="p-1" aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <form
          className="flex-1 px-4 pb-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) {
              showToast("Choose a video");
              return;
            }
            setBusy(true);
            void apiUploadVideo(file, caption.trim() || undefined, file.name, soundId ? { soundId } : undefined).then((res) => {
              setBusy(false);
              if (!res.ok) {
                showToast(res.error);
                return;
              }
              navigate("/feed", { replace: true });
            });
          }}
        >
          <label className="block w-full aspect-[9/16] max-h-[46vh] rounded-xl overflow-hidden bg-black border border-white/10">
            {preview ? (
              <video src={preview} className="w-full h-full object-cover" muted playsInline />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/40 text-sm">Tap to choose video</div>
            )}
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const next = e.target.files?.[0] ?? null;
                setFile(next);
                setPreview(next ? URL.createObjectURL(next) : null);
              }}
            />
          </label>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption"
            className="w-full bg-white/10 border border-white/10 rounded-xl px-3 py-3"
          />
          <button type="submit" disabled={busy} className="w-full border border-[#D8D9DD]/40 rounded-xl py-3 font-bold">
            {busy ? "Uploading..." : "Post"}
          </button>
        </form>
      </div>
    </div>
  );
}
