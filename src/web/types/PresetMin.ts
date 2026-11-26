export const PRESETS = [30, 60, 90, 120, 260] as const;

export type PresetMin = (typeof PRESETS)[number];
