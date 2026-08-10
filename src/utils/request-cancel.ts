export interface NativeRequestCancelToken {
  readonly id: string;
  aborted: boolean;
  abort(): void;
  onAbort(listener: () => void): void;
}

let cancelSeq = 0;

export function createNativeRequestCancelToken(): NativeRequestCancelToken {
  cancelSeq += 1;
  const id = `req-${Date.now()}-${cancelSeq}`;
  const listeners = new Set<() => void>();
  let aborted = false;
  return {
    id,
    get aborted() {
      return aborted;
    },
    abort() {
      if (aborted) return;
      aborted = true;
      for (const listener of [...listeners]) listener();
      listeners.clear();
    },
    onAbort(listener) {
      if (aborted) {
        listener();
        return;
      }
      listeners.add(listener);
    },
  };
}
