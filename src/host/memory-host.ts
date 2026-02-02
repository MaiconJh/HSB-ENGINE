import type { HostAdapter } from "./host-adapter.ts";

const MAX_KEYS = 1000;

export class MemoryHost implements HostAdapter {
  private storeMap = new Map<string, unknown>();

  store = {
    get: async (key: string): Promise<unknown | null> => {
      return this.storeMap.has(key) ? this.storeMap.get(key) ?? null : null;
    },
    set: async (key: string, value: unknown): Promise<void> => {
      if (this.storeMap.has(key)) {
        this.storeMap.delete(key);
      }
      this.storeMap.set(key, value);
      if (this.storeMap.size > MAX_KEYS) {
        const oldestKey = this.storeMap.keys().next().value;
        if (oldestKey) {
          this.storeMap.delete(oldestKey);
        }
      }
    },
  };
}
