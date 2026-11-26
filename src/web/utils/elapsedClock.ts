export function elapsedClock(sec: number): string {
  const mins = Math.floor(sec / 60);
  const rest = sec % 60;
  return `${mins}:${String(rest).padStart(2, "0")}`;
}
