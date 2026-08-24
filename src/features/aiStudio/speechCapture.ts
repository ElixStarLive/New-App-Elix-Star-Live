export type SpeechSegment = {
  text: string;
  start: number;
  end: number;
};

type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

function recognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechRecognitionSupported(): boolean {
  return recognitionCtor() !== null;
}

export class StudioSpeechCapture {
  private rec: RecognitionLike | null = null;
  private segments: SpeechSegment[] = [];
  private startedAt = 0;

  start(lang: string, onUpdate: (segments: SpeechSegment[]) => void): boolean {
    const Ctor = recognitionCtor();
    if (!Ctor) return false;
    this.stop();
    this.segments = [];
    this.startedAt = Date.now();
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    rec.onresult = (event) => {
      const next: SpeechSegment[] = [];
      for (let i = 0; i < event.results.length; i++) {
        const row = event.results[i];
        if (!row?.isFinal) continue;
        const text = row[0]?.transcript?.trim();
        if (!text) continue;
        next.push({
          text,
          start: (Date.now() - this.startedAt) / 1000,
          end: (Date.now() - this.startedAt) / 1000,
        });
      }
      this.segments = next;
      onUpdate([...this.segments]);
    };
    rec.onerror = () => {
      /* caller reads segments on stop */
    };
    rec.onend = () => {
      this.rec = null;
    };
    try {
      rec.start();
    } catch {
      return false;
    }
    this.rec = rec;
    return true;
  }

  stop(): SpeechSegment[] {
    try {
      this.rec?.stop();
    } catch {
      /* already stopped */
    }
    this.rec = null;
    return [...this.segments];
  }
}
