export function toUint8Array(data: unknown): Uint8Array | null {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return Uint8Array.from(data);
  if (data && typeof data === 'object') {
    const candidate = data as { data?: unknown; body?: unknown };
    const inner = candidate.data ?? candidate.body;
    if (inner instanceof Uint8Array) return inner;
    if (inner instanceof ArrayBuffer) return new Uint8Array(inner);
  }
  return null;
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}
