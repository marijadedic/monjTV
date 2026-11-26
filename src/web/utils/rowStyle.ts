export function rowStyle(span: number): Record<string, string> {
  return { "--mins": String(Math.max(0, span)) };
}
