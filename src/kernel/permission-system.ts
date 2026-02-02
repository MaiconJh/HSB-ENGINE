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

const MODULE_ID_PATTERN = /^[a-z0-9_.:-]+$/;
const DIAGNOSTIC_WINDOW_MS = 500;
const DIAGNOSTIC_CACHE_LIMIT = 500;

export class PermissionSystem {
  private permissions = new Map<string, Set<Permission>>();
  private eventBus: EventBus;
  private lastDiagnosticAt = new Map<string, number>();

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  grant(moduleId: string, perms: Permission[]): void {
    this.assertValidModuleId(moduleId);
    const current = this.permissions.get(moduleId) ?? new Set<Permission>();
    for (const perm of perms) {
      current.add(perm);
    }
    this.permissions.set(moduleId, current);
  }

  revoke(moduleId: string, perms: Permission[]): void {
    this.assertValidModuleId(moduleId);
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
    this.assertValidModuleId(moduleId);
    if (moduleId === "kernel") {
      return true;
    }
    return this.permissions.get(moduleId)?.has(perm) ?? false;
  }

  assert(moduleId: string, perm: Permission, context: PermissionContext): void {
    this.assertValidModuleId(moduleId);
    if (this.has(moduleId, perm)) {
      return;
    }
    if (this.shouldEmitDiagnostic(moduleId, perm, context)) {
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
    }
    throw new PermissionError(
      `Permission denied: "${moduleId}" missing "${perm}" for ${context.action}.`
    );
  }

  private assertValidModuleId(moduleId: string): void {
    if (moduleId === "kernel") {
      return;
    }
    if (!MODULE_ID_PATTERN.test(moduleId)) {
      throw new PermissionError(`Invalid moduleId "${moduleId}".`);
    }
  }

  private shouldEmitDiagnostic(
    moduleId: string,
    perm: Permission,
    context: PermissionContext
  ): boolean {
    const keyParts = [`${moduleId}`, `${perm}`, `${context.action}`];
    if (context.eventName) {
      keyParts.push(`event:${context.eventName}`);
    }
    if (context.target) {
      keyParts.push(`target:${context.target}`);
    }
    const key = keyParts.join("|");
    const now = Date.now();
    const last = this.lastDiagnosticAt.get(key);
    if (last !== undefined && now - last < DIAGNOSTIC_WINDOW_MS) {
      return false;
    }
    if (this.lastDiagnosticAt.has(key)) {
      this.lastDiagnosticAt.delete(key);
    }
    this.lastDiagnosticAt.set(key, now);
    if (this.lastDiagnosticAt.size > DIAGNOSTIC_CACHE_LIMIT) {
      const oldestKey = this.lastDiagnosticAt.keys().next().value;
      if (oldestKey) {
        this.lastDiagnosticAt.delete(oldestKey);
      }
    }
    return true;
  }
}
