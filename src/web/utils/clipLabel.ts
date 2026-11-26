export function clipLabel(name: string, max = 28): string {
  const text = name.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 3)).trimEnd()}...`;
}
