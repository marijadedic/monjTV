import { PRESETS, type PresetMin } from "../types/PresetMin.ts";

export function isPreset(value: number): value is PresetMin {
  return (PRESETS as readonly number[]).includes(value);
}
