export function newItemId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function")
    return cryptoObj.randomUUID();
  return `item-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}
