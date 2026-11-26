import type { LengthChoice } from "../types/LengthChoice.ts";

export function minutesOfChoice(choice: LengthChoice, customMin: string): number | null {
  if (choice === "longest") return null;
  if (choice === "custom") {
    if (!/^\d+$/.test(customMin.trim())) return null;
    const mins = Number(customMin);
    return mins >= 1 ? mins : null;
  }
  return choice;
}
