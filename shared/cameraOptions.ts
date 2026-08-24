export type CameraFilterOption = {
  id: string;
  name: string;
  color: string;
  css: string;
};

export type CameraSpeedOption = {
  value: number;
  label: string;
};

export type CameraStickerOption = {
  emoji: string;
};

/** Static Create-camera lists. Same values the camera chrome already renders. */
export const CAMERA_FILTER_OPTIONS: CameraFilterOption[] = [
  { id: "none", name: "Normal", color: "#3A3A3A", css: "none" },
  { id: "warm", name: "Warm", color: "#E8A87C", css: "sepia(0.3) saturate(1.3) brightness(1.05)" },
  { id: "cool", name: "Cool", color: "#7CB5E8", css: "saturate(1.2) hue-rotate(-10deg) brightness(1.03)" },
  { id: "vivid", name: "Vivid", color: "#E85C7A", css: "saturate(1.6) contrast(1.1)" },
  { id: "vintage", name: "Vintage", color: "#C7A96B", css: "sepia(0.5) contrast(0.95) brightness(1.05) saturate(1.1)" },
  { id: "fade", name: "Fade", color: "#B8B0A8", css: "contrast(0.85) brightness(1.1) saturate(0.85)" },
  { id: "mono", name: "Mono", color: "#9A9A9A", css: "grayscale(1) contrast(1.1)" },
  { id: "noir", name: "Noir", color: "#4A4A4A", css: "grayscale(1) contrast(1.4) brightness(0.95)" },
];

export const CAMERA_SPEED_OPTIONS: CameraSpeedOption[] = [
  { value: 0.3, label: "0.3x" },
  { value: 0.5, label: "0.5x" },
  { value: 1, label: "1x" },
  { value: 2, label: "2x" },
  { value: 3, label: "3x" },
];

export const CAMERA_STICKER_OPTIONS: CameraStickerOption[] = [
  "😀",
  "😍",
  "🔥",
  "❤️",
  "😂",
  "🎉",
  "👍",
  "💯",
  "✨",
  "🥳",
  "😎",
  "🙌",
  "💖",
  "🌟",
  "👀",
  "💪",
  "🎶",
  "🌈",
  "⭐",
  "😭",
  "🥰",
  "😳",
  "👑",
  "💎",
].map((emoji) => ({ emoji }));
