import type { Day } from "../../../shared/types.ts";
import type { ErrorBook } from "../messages.ts";
import { fill } from "./fill.ts";

export function translateError(message: string, errors: ErrorBook, day: Record<Day, string>): string {
  const exact = errors.exact[message];
  if (exact) return exact;
  for (const pattern of errors.patterns) {
    const match = new RegExp(pattern.re).exec(message);
    if (!match) continue;
    if (pattern.kind === "suffix") {
      return fill(pattern.text, { suffix: match[1] ? ` ${match[1]}` : "" });
    }
    if (pattern.kind === "day") {
      const name = match[1] ?? "";
      return fill(pattern.text, { day: day[name as Day] ?? name, rest: match[2] ?? "" });
    }
    return fill(pattern.text, { "1": match[1] ?? "" });
  }
  return message;
}
