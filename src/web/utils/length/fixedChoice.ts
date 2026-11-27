import type { LengthChoice } from "../../types/LengthChoice.ts";
import { choiceFromLength } from "@utils/length/choiceFromLength.ts";

export function fixedChoice(lengthMin?: number): {
  lengthChoice: LengthChoice;
  customMin: string;
} {
  const choice = choiceFromLength(lengthMin);
  if (choice.lengthChoice === "longest")
    return { lengthChoice: 60, customMin: "" };
  return choice;
}
