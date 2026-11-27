import type { LengthChoice } from "../../types/LengthChoice.ts";
import { isPreset } from "@utils/length/isPreset.ts";

export function choiceFromLength(lengthMin?: number): {
  lengthChoice: LengthChoice;
  customMin: string;
} {
  if (lengthMin && isPreset(lengthMin))
    return { lengthChoice: lengthMin, customMin: "" };
  if (lengthMin && lengthMin > 0)
    return { lengthChoice: "custom", customMin: String(lengthMin) };
  return { lengthChoice: "longest", customMin: "" };
}
