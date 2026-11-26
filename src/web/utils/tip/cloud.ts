let tipEl: HTMLSpanElement | null = null;
let tipHost: HTMLElement | null = null;
let tipWatch: MutationObserver | null = null;
let tipFrame: HTMLElement | null = null;

function tipNode(): HTMLSpanElement {
  if (!tipEl) {
    tipEl = document.createElement("span");
    tipEl.className = "cloud lifted";
    tipEl.setAttribute("role", "tooltip");
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

export function placeCloud(event: { currentTarget: EventTarget | null }) {
  const host = event.currentTarget as HTMLElement | null;
  const source = host?.querySelector(":scope > .cloud") as HTMLElement | null;
  if (!host || !source) return;
  const tip = tipNode();
  tipHost = host;
  tipWatch?.disconnect();
  const sync = () => {
    tip.textContent = source.textContent ?? "";
  };
  sync();
  tipWatch = new MutationObserver(sync);
  tipWatch.observe(source, { subtree: true, characterData: true, childList: true });
  const frame = host.closest(".add-form") as HTMLElement | null;
  if (tipFrame !== frame) {
    tipFrame?.removeEventListener("scroll", onTipScroll);
    tipFrame = frame;
    tipFrame?.addEventListener("scroll", onTipScroll, { passive: true });
  }
  tip.style.display = "block";
  tip.style.visibility = "hidden";
  const hostRect = host.getBoundingClientRect();
  const width = tip.offsetWidth;
  const height = tip.offsetHeight;
  const pad = 12;
  let left = hostRect.left;
  if (left + width > window.innerWidth - pad) left = window.innerWidth - pad - width;
  if (left < pad) left = pad;
  let top = hostRect.top - height - 12;
  const below = top < pad;
  if (below) top = Math.min(hostRect.bottom + 12, window.innerHeight - height - pad);
  tip.classList.toggle("below", below);
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  const tail = hostRect.left + hostRect.width / 2 - left;
  tip.style.setProperty("--tail", `${Math.min(Math.max(tail, 14), Math.max(14, width - 14))}px`);
  tip.style.visibility = "";
}

function onTipScroll() {
  if (tipHost) placeCloud({ currentTarget: tipHost });
}

export function dismissTip() {
  tipWatch?.disconnect();
  tipWatch = null;
  tipHost = null;
  tipFrame?.removeEventListener("scroll", onTipScroll);
  tipFrame = null;
  if (!tipEl) return;
  tipEl.style.display = "none";
  tipEl.classList.remove("below");
}

export function showCloud(event: { currentTarget: EventTarget | null }) {
  const node = event.currentTarget as HTMLElement | null;
  const host = node?.closest(".cloud-host");
  if (host) placeCloud({ currentTarget: host });
}

export function hideCloud(event: { currentTarget: EventTarget | null }) {
  const host = event.currentTarget as HTMLElement | null;
  if (!host || tipHost !== host || host.contains(document.activeElement)) return;
  dismissTip();
}

export function blurCloud(event: { currentTarget: EventTarget | null }) {
  const node = event.currentTarget as HTMLElement | null;
  const host = node?.closest(".cloud-host");
  if (!host || host.matches(":hover")) return;
  if (tipHost === host) dismissTip();
}
