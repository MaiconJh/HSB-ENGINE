import { EventBus } from "./event-bus.ts";
import { PermissionError } from "./errors.ts";

export type Permission =
  | "event.emit_reserved"
  | "kernel.control"
  | "storage.read"
  | "storage.write"
  | "telemetry.read"
  | "schema.register"
  | "backpressure.configure";

type PermissionContext = {
  action: string;
  target?: string;
  eventName?: string;
};

export class PermissionSystem {
  private permissions = new Map<string, Set<Permission>>();
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  grant(moduleId: string, perms: Permission[]): void {
    const current = this.permissions.get(moduleId) ?? new Set<Permission>();
    for (const perm of perms) {
      current.add(perm);
    }
    this.permissions.set(moduleId, current);
  }

  revoke(moduleId: string, perms: Permission[]): void {
    const current = this.permissions.get(moduleId);
    if (!current) {
      return;
    }
    for (const perm of perms) {
      current.delete(perm);
    }
    if (current.size === 0) {
      this.permissions.delete(moduleId);
    }
  }

  has(moduleId: string, perm: Permission): boolean {
    if (moduleId === "kernel") {
      return true;
    }
    return this.permissions.get(moduleId)?.has(perm) ?? false;
  }

  assert(moduleId: string, perm: Permission, context: PermissionContext): void {
    if (this.has(moduleId, perm)) {
      return;
    }
    this.eventBus.emit(
      "diagnostic:permission_violation",
      {
        source: moduleId,
        permission: perm,
        action: context.action,
        target: context.target,
        eventName: context.eventName,
        timestamp: Date.now(),
      },
      { source: "kernel" }
    );
    throw new PermissionError(
      `Permission denied: "${moduleId}" missing "${perm}" for ${context.action}.`
    );
  }
}
