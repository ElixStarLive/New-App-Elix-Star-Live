export type AiFilterCategory = "cinematic" | "portrait" | "mood" | "vintage" | "artistic";

export type AiFilterPreset = {
  id: string;
  name: string;
  category: AiFilterCategory;
  css: string;
  preview: string;
};

export const AI_FILTER_CATEGORIES: { id: AiFilterCategory; label: string }[] = [
  { id: "cinematic", label: "Cinematic" },
  { id: "portrait", label: "Portrait" },
  { id: "mood", label: "Mood" },
  { id: "vintage", label: "Vintage" },
  { id: "artistic", label: "Artistic" },
];

export const AI_FILTER_PRESETS: AiFilterPreset[] = [
  { id: "none", name: "Original", category: "cinematic", css: "none", preview: "🎬" },
  { id: "cinema-warm", name: "Golden Hour", category: "cinematic", css: "saturate(1.3) contrast(1.1) sepia(0.15) brightness(1.05)", preview: "🌅" },
  { id: "cinema-cold", name: "Nordic", category: "cinematic", css: "saturate(0.85) contrast(1.15) hue-rotate(-10deg) brightness(1.05)", preview: "❄️" },
  { id: "cinema-teal", name: "Teal & Orange", category: "cinematic", css: "saturate(1.4) contrast(1.2) hue-rotate(-15deg) brightness(0.95)", preview: "🎥" },
  { id: "cinema-noir", name: "Film Noir", category: "cinematic", css: "grayscale(0.9) contrast(1.4) brightness(0.9)", preview: "🖤" },
  { id: "cinema-blade", name: "Blade Runner", category: "cinematic", css: "saturate(1.5) contrast(1.3) hue-rotate(10deg) brightness(0.85)", preview: "🌃" },
  { id: "cinema-matte", name: "Matte Film", category: "cinematic", css: "contrast(0.9) brightness(1.1) saturate(0.9) sepia(0.05)", preview: "📽️" },
  { id: "port-soft", name: "Soft Glow", category: "portrait", css: "brightness(1.1) contrast(0.95) saturate(1.1) blur(0.3px)", preview: "✨" },
  { id: "port-beauty", name: "Beauty", category: "portrait", css: "brightness(1.08) contrast(0.92) saturate(1.15) sepia(0.03)", preview: "💎" },
  { id: "port-hd", name: "HD Clarity", category: "portrait", css: "contrast(1.15) brightness(1.02) saturate(1.05)", preview: "🔍" },
  { id: "port-warm", name: "Warm Skin", category: "portrait", css: "sepia(0.12) saturate(1.2) brightness(1.05) contrast(1.02)", preview: "🌸" },
  { id: "port-youth", name: "Youth Glow", category: "portrait", css: "brightness(1.12) contrast(0.88) saturate(1.22) blur(0.35px)", preview: "💫" },
  { id: "port-age", name: "Aged Look", category: "portrait", css: "sepia(0.38) saturate(0.72) contrast(1.1) brightness(0.9)", preview: "🎭" },
  { id: "mood-dreamy", name: "Dreamy", category: "mood", css: "brightness(1.15) contrast(0.85) saturate(1.3) sepia(0.1)", preview: "💭" },
  { id: "mood-dark", name: "Moody Dark", category: "mood", css: "brightness(0.8) contrast(1.3) saturate(0.9)", preview: "🌑" },
  { id: "mood-neon", name: "Neon Nights", category: "mood", css: "saturate(1.8) contrast(1.2) brightness(0.9) hue-rotate(20deg)", preview: "💜" },
  { id: "mood-sunset", name: "Sunset Glow", category: "mood", css: "sepia(0.25) saturate(1.5) brightness(1.05) hue-rotate(-10deg)", preview: "🌇" },
  { id: "vint-retro", name: "Retro 70s", category: "vintage", css: "sepia(0.35) saturate(1.3) contrast(1.1) brightness(1.05)", preview: "📻" },
  { id: "vint-faded", name: "Faded Film", category: "vintage", css: "sepia(0.2) saturate(0.8) contrast(0.9) brightness(1.1)", preview: "🎞️" },
  { id: "vint-polaroid", name: "Polaroid", category: "vintage", css: "sepia(0.3) contrast(1.15) brightness(1.1) saturate(0.85)", preview: "📸" },
  { id: "vint-vhs", name: "VHS", category: "vintage", css: "saturate(1.4) contrast(1.1) brightness(0.95) sepia(0.1) hue-rotate(5deg)", preview: "📼" },
  { id: "art-pop", name: "Pop Art", category: "artistic", css: "saturate(2) contrast(1.4) brightness(1.05)", preview: "🎨" },
  { id: "art-bw-high", name: "B&W High Key", category: "artistic", css: "grayscale(1) brightness(1.2) contrast(1.1)", preview: "⬜" },
  { id: "art-bw-low", name: "B&W Low Key", category: "artistic", css: "grayscale(1) brightness(0.8) contrast(1.4)", preview: "⬛" },
  { id: "art-chrome", name: "Chrome", category: "artistic", css: "saturate(0.6) contrast(1.3) brightness(1.1) sepia(0.1)", preview: "🪞" },
];

export type EnhanceSettings = {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  sharpness: number;
  vignette: number;
  grain: number;
  fade: number;
};

export const DEFAULT_ENHANCE: EnhanceSettings = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  sharpness: 0,
  vignette: 0,
  grain: 0,
  fade: 0,
};

export type VoiceEffect = { id: string; name: string; icon: string };

export const VOICE_EFFECTS: VoiceEffect[] = [
  { id: "none", name: "Original", icon: "🎤" },
  { id: "deep", name: "Deep Voice", icon: "🔊" },
  { id: "high", name: "High Pitch", icon: "🔔" },
  { id: "chipmunk", name: "Chipmunk", icon: "🐿️" },
  { id: "robot", name: "Robot", icon: "🤖" },
  { id: "echo", name: "Echo", icon: "🏔️" },
  { id: "reverb", name: "Concert Hall", icon: "🏛️" },
  { id: "telephone", name: "Telephone", icon: "📞" },
  { id: "radio", name: "Vintage Radio", icon: "📻" },
  { id: "studio", name: "Studio Clean", icon: "🎙️" },
  { id: "warm", name: "Warm Tone", icon: "☀️" },
  { id: "megaphone", name: "Megaphone", icon: "📣" },
];

export type BackgroundOption = {
  id: string;
  name: string;
  kind: "none" | "blur" | "color" | "gradient";
  value: string;
  preview: string;
};

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  { id: "none", name: "Original", kind: "none", value: "", preview: "📷" },
  { id: "blur-light", name: "Soft Blur", kind: "blur", value: "8px", preview: "🌫️" },
  { id: "blur-medium", name: "Medium Blur", kind: "blur", value: "16px", preview: "💨" },
  { id: "blur-heavy", name: "Heavy Blur", kind: "blur", value: "30px", preview: "🌊" },
  { id: "color-black", name: "Black", kind: "color", value: "#000000", preview: "⬛" },
  { id: "color-white", name: "White", kind: "color", value: "#FFFFFF", preview: "⬜" },
  { id: "color-green", name: "Green Screen", kind: "color", value: "#00FF00", preview: "🟩" },
  { id: "grad-sunset", name: "Sunset", kind: "gradient", value: "linear-gradient(135deg, #FF6B6B, #FFE66D)", preview: "🌅" },
  { id: "grad-ocean", name: "Ocean", kind: "gradient", value: "linear-gradient(135deg, #667eea, #764ba2)", preview: "🌊" },
  { id: "grad-neon", name: "Neon", kind: "gradient", value: "linear-gradient(135deg, #f093fb, #f5576c)", preview: "💜" },
  { id: "grad-gold", name: "Gold", kind: "gradient", value: "linear-gradient(135deg, #FFFFFF, #FFFFFF)", preview: "✨" },
  { id: "grad-dark", name: "Dark Mode", kind: "gradient", value: "linear-gradient(135deg, #1A1A1F, #1C1E24)", preview: "🌑" },
];

export type SubtitleStyleOption = {
  id: string;
  name: string;
  fontFamily: string;
  animation: string;
  position: string;
};

export const SUBTITLE_STYLES: SubtitleStyleOption[] = [
  { id: "classic", name: "Classic", fontFamily: "Arial, sans-serif", animation: "none", position: "bottom" },
  { id: "bold", name: "Bold", fontFamily: "Montserrat, sans-serif", animation: "pop", position: "bottom" },
  { id: "neon", name: "Neon", fontFamily: "Montserrat, sans-serif", animation: "pop", position: "center" },
  { id: "minimal", name: "Minimal", fontFamily: "Inter, sans-serif", animation: "fade", position: "bottom" },
  { id: "cinematic", name: "Cinematic", fontFamily: "Georgia, serif", animation: "typewriter", position: "center" },
  { id: "karaoke", name: "Karaoke", fontFamily: "Montserrat, sans-serif", animation: "karaoke", position: "bottom" },
  { id: "outline", name: "Outline", fontFamily: "Arial Black, sans-serif", animation: "pop", position: "bottom" },
  { id: "gradient", name: "Gradient", fontFamily: "Montserrat, sans-serif", animation: "fade", position: "center" },
];

export const SUBTITLE_LANGUAGES = [
  { code: "en-US", name: "English (US)" },
  { code: "en-GB", name: "English (UK)" },
  { code: "es-ES", name: "Spanish" },
  { code: "fr-FR", name: "French" },
  { code: "de-DE", name: "German" },
  { code: "it-IT", name: "Italian" },
  { code: "pt-BR", name: "Portuguese" },
  { code: "ro-RO", name: "Romanian" },
  { code: "ja-JP", name: "Japanese" },
  { code: "ko-KR", name: "Korean" },
  { code: "zh-CN", name: "Chinese (Simplified)" },
  { code: "hi-IN", name: "Hindi" },
  { code: "ar-SA", name: "Arabic" },
  { code: "ru-RU", name: "Russian" },
  { code: "tr-TR", name: "Turkish" },
];

export type AiStudioTab = "filters" | "enhance" | "captions" | "thumbnails" | "voice" | "subtitles" | "background";
