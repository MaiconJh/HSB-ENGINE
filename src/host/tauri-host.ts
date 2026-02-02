import type { HostAdapter } from "./host-adapter.ts";
import { BaseDirectory, readTextFile, readDir } from "@tauri-apps/api/fs";
import { Store } from "@tauri-apps/plugin-store";

const MAX_KEYS = 1000;

export class TauriHost implements HostAdapter {
  private storeMap = new Map<string, unknown>();
  private tauriStore: Store;

  constructor(storePath = "kernel-store.json") {
    this.tauriStore = new Store(storePath);
  }

  store = {
    get: async (key: string): Promise<unknown | null> => {
      const value = await this.tauriStore.get<unknown>(key);
      return value ?? null;
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
          await this.tauriStore.delete(oldestKey);
        }
      }
      await this.tauriStore.set(key, value);
      await this.tauriStore.save();
    },
  };

  fs = {
    listDir: async (path: string): Promise<string[]> => {
      const entries = await readDir(path, { dir: BaseDirectory.App });
      const names = entries.map((entry) => entry.name ?? "").filter(Boolean);
      return names.sort();
    },
    readTextFile: async (path: string): Promise<string> => {
      return readTextFile(path, { dir: BaseDirectory.App });
    },
    exists: async (path: string): Promise<boolean> => {
      try {
        await readTextFile(path, { dir: BaseDirectory.App });
        return true;
      } catch {
        return false;
      }
    },
  };
}
