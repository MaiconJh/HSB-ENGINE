import type { HostAdapter } from "../host/host-adapter.ts";
import { CacheError } from "./errors.ts";
import { PermissionSystem } from "./permission-system.ts";

export class CacheStore {
  private store = new Map<string, unknown>();
  private permissionSystem: PermissionSystem;
  private hostAdapter?: HostAdapter;

  constructor(permissionSystem: PermissionSystem, hostAdapter?: HostAdapter) {
    this.permissionSystem = permissionSystem;
    this.hostAdapter = hostAdapter;
  }

  async get<T>(key: string, meta?: { source: string }): Promise<T | undefined> {
    const source = meta?.source ?? "kernel";
    this.permissionSystem.assert(source, "storage.read", {
      action: "storage.read",
      target: key,
    });
    if (this.hostAdapter) {
      const value = await this.hostAdapter.store.get(key);
      return value as T | undefined;
    }
    return this.store.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T, meta?: { source: string }): Promise<void> {
    const source = meta?.source ?? "kernel";
    this.permissionSystem.assert(source, "storage.write", {
      action: "storage.write",
      target: key,
    });
    this.assertJsonSafe(value);
    if (this.hostAdapter) {
      await this.hostAdapter.store.set(key, value);
      return;
    }
    this.store.set(key, value);
  }

  getSize(): number {
    return this.store.size;
  }

  private assertJsonSafe(value: unknown): void {
    try {
      JSON.stringify(value, (_key, val) => {
        if (typeof val === "function") {
          throw new CacheError("CacheStore value contains non-serializable function.");
        }
        if (typeof val === "symbol") {
          throw new CacheError("CacheStore value contains non-serializable symbol.");
        }
        return val;
      });
    } catch (error) {
      if (error instanceof CacheError) {
        throw error;
      }
      throw new CacheError(
        `CacheStore value must be JSON-serializable: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
