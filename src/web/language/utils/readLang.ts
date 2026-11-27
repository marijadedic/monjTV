import { LANG_STORAGE_KEY } from "../../constants/langStorageKey.ts";

export function readLang(): "en" | "hr" {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored === "en" || stored === "hr") return stored;
  } catch {
    /* private mode */
  }
  if (
    typeof navigator !== "undefined" &&
    navigator.language.toLowerCase().startsWith("hr")
  ) {
    return "hr";
  }
  return "en";
}
