// The desktop browser keeps an old copy of "/". Tie each navigation to this build
// so Today and Admin load the same files after a rebuild.
export function pageHref(path: string): string {
  const script = document.querySelector("script[src*='assets/index-']");
  const src = script instanceof HTMLScriptElement ? (script.getAttribute("src") ?? "") : "";
  const hash = src.match(/index-([\w-]+)\.js/)?.[1];
  if (!hash) return path;
  return `${path}${path.includes("?") ? "&" : "?"}v=${hash}`;
}
