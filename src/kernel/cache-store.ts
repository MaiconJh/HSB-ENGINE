import { PermissionSystem } from "./permission-system.ts";

export class CacheStore {
  private store = new Map<string, unknown>();
  private permissionSystem: PermissionSystem;

  constructor(permissionSystem: PermissionSystem) {
    this.permissionSystem = permissionSystem;
  }

  async get<T>(key: string, meta?: { source: string }): Promise<T | undefined> {
    const source = meta?.source ?? "kernel";
    this.permissionSystem.assert(source, "storage.read", {
      action: "storage.read",
      target: key,
    });
    return this.store.get(key) as T | undefined;
  }

  async set<T>(key: string, value: T, meta?: { source: string }): Promise<void> {
    const source = meta?.source ?? "kernel";
    this.permissionSystem.assert(source, "storage.write", {
      action: "storage.write",
      target: key,
    });
    this.store.set(key, value);
  }
}
