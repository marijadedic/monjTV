import type { ItemMode } from "../../shared/types.ts";

export type DraftItem = {
  id: string;
  mode: ItemMode;
  folder: string;
  file: string;
  title: string;
  durationSec: number | null;
  lengthMin?: number;
  gapAfterMin?: number;
  error?: string;
};
