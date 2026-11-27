import type { CountParts } from "../messages.ts";
import { fill } from "./fill.ts";

function countForm(count: number, lang: "en" | "hr"): keyof CountParts {
  if (lang !== "hr") return count === 1 ? "one" : "many";

  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "one";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
  return "many";
}

export function videoCount(
  count: number,
  forms: CountParts,
  lang: "en" | "hr",
): string {
  const form = countForm(count, lang);
  return fill(forms[form], { count });
}
