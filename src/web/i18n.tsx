import { createContext, type ComponentChildren } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import croatianJson from "./language/croatian.json";
import englishJson from "./language/english.json";
import { LANG_STORAGE_KEY } from "./constants/langStorageKey.ts";
import type { Copy, Messages } from "./language/messages.ts";
import { copyOf } from "./language/utils/copyOf.ts";
import { readLang } from "./language/utils/readLang.ts";

export type Lang = "en" | "hr";
export { readLang };

const english: Messages = englishJson;
const croatian: Messages = croatianJson;

const copy: Record<Lang, Copy> = {
  en: copyOf(english, "en"),
  hr: copyOf(croatian, "hr"),
};

type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Copy;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ComponentChildren }) {
  const [lang, setLang] = useState<Lang>(readLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      /* private mode */
    }
  }, [lang]);

  return <I18nContext.Provider value={{ lang, setLang, t: copy[lang] }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within I18nProvider");
  return value;
}
