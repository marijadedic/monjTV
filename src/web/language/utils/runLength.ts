import type { RunParts } from "../messages.ts";
import { fill } from "./fill.ts";

export function runLength(sec: number, units: RunParts): string {
  const safe = Math.max(0, Math.round(sec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const parts: string[] = [];
  if (h) parts.push(fill(units.h, { n: h }));
  if (m) parts.push(fill(units.m, { n: m }));
  if (s) parts.push(fill(units.s, { n: s }));
  if (parts.length === 0) return units.zero;
  return parts.join(" ");
}
