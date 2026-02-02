import type { CacheStore } from "./cache-store.ts";
import type { EventBus } from "./event-bus.ts";
import { KernelBridgeError } from "./errors.ts";
import type { KernelModule } from "./module-loader.ts";
import type { ModuleDefinition, ModuleManifest } from "./manifest.ts";
import type { ModuleLoader } from "./module-loader.ts";
import type { SchemaRegistry } from "./schema-registry.ts";
import type { KernelSnapshot, KernelSnapshotter } from "./snapshot.ts";
import { BUILTIN_VALIDATORS } from "./builtin-validators.ts";
import type { HostAdapter } from "../host/host-adapter.ts";
import { discoverModules } from "../host/module-discovery.ts";
import { validateManifest } from "./manifest.ts";

export type KernelCommandName =
  | "kernel.snapshot.get"
  | "event.emit"
  | "module.register"
  | "module.start"
  | "module.stop"
  | "module.isolate"
  | "module.reset"
  | "cache.get"
  | "cache.set"
  | "schema.bindValidator"
  | "host.modules.scan";

export type KernelCommandMeta = {
  source: string;
};

type ModuleRegisterPayload =
  | { definition: ModuleDefinition }
  | { manifest: ModuleManifest; module: KernelModule };

type CacheGetResult = { value: unknown };
type CacheSetResult = { ok: true };
type ModuleCommandResult = { ok: true; state?: string };

export class KernelBridge {
  private eventBus: EventBus;
  private moduleLoader: ModuleLoader;
  private cacheStore: CacheStore;
  private schemaRegistry: SchemaRegistry;
  private snapshotter: KernelSnapshotter;
  private host?: HostAdapter;

  constructor(options: {
    eventBus: EventBus;
    moduleLoader: ModuleLoader;
    cacheStore: CacheStore;
    schemaRegistry: SchemaRegistry;
    snapshotter: KernelSnapshotter;
    host?: HostAdapter;
  }) {
    this.eventBus = options.eventBus;
    this.moduleLoader = options.moduleLoader;
    this.cacheStore = options.cacheStore;
    this.schemaRegistry = options.schemaRegistry;
    this.snapshotter = options.snapshotter;
    this.host = options.host;
  }

  dispatch(
    name: KernelCommandName,
    payload: unknown,
    meta: KernelCommandMeta
  ):
    | KernelSnapshot
    | CacheGetResult
    | CacheSetResult
    | ModuleCommandResult
    | Promise<unknown> {
    this.assertMeta(meta);
    switch (name) {
      case "kernel.snapshot.get":
        this.assertEmptyPayload(payload, name);
        return this.snapshotter.snapshot();
      case "event.emit":
        return this.handleEventEmit(payload, meta);
      case "module.register":
        return this.handleModuleRegister(payload, meta);
      case "module.start":
        return this.handleModuleStart(payload);
      case "module.stop":
        return this.handleModuleStop(payload, meta);
      case "module.isolate":
        return this.handleModuleIsolate(payload, meta);
      case "module.reset":
        return this.handleModuleReset(payload, meta);
      case "cache.get":
        return this.handleCacheGet(payload, meta);
      case "cache.set":
        return this.handleCacheSet(payload, meta);
      case "schema.bindValidator":
        return this.handleSchemaBind(payload, meta);
      case "host.modules.scan":
        return this.handleHostModulesScan(payload, meta);
      default:
        throw new KernelBridgeError(`Unknown kernel command "${name}".`);
    }
  }

  private handleEventEmit(
    payload: unknown,
    meta: KernelCommandMeta
  ): { ok: true } {
    const { name, payload: eventPayload } = this.assertPayloadShape<{
      name: string;
      payload: unknown;
    }>(payload, ["name", "payload"], "event.emit");
    if (typeof name !== "string" || name.length === 0) {
      throw new KernelBridgeError("event.emit requires a non-empty name.");
    }
    this.eventBus.emit(name, eventPayload, { source: meta.source });
    return { ok: true };
  }

  private handleModuleRegister(
    payload: unknown,
    meta: KernelCommandMeta
  ): ModuleCommandResult {
    if (meta.source !== "kernel") {
      throw new KernelBridgeError("module.register is restricted to kernel.");
    }
    if (!payload || typeof payload !== "object") {
      throw new KernelBridgeError("module.register requires a payload.");
    }
    const modulePayload = payload as ModuleRegisterPayload;
    if ("definition" in modulePayload) {
      this.moduleLoader.register(modulePayload.definition);
      return { ok: true };
    }
    if ("manifest" in modulePayload && "module" in modulePayload) {
      this.moduleLoader.register({
        manifest: modulePayload.manifest,
        module: modulePayload.module,
      });
      return { ok: true };
    }
    throw new KernelBridgeError("module.register requires a definition or manifest/module.");
  }

  private handleModuleStart(payload: unknown): ModuleCommandResult {
    const { id } = this.assertPayloadShape<{ id: string }>(payload, ["id"], "module.start");
    if (typeof id !== "string" || id.length === 0) {
      throw new KernelBridgeError("module.start requires a non-empty id.");
    }
    this.moduleLoader.start(id);
    return { ok: true, state: this.moduleLoader.getState(id) };
  }

  private handleModuleStop(
    payload: unknown,
    meta: KernelCommandMeta
  ): ModuleCommandResult {
    const { id, reason } = this.assertPayloadShape<{ id: string; reason?: string }>(
      payload,
      ["id"],
      "module.stop"
    );
    if (typeof id !== "string" || id.length === 0) {
      throw new KernelBridgeError("module.stop requires a non-empty id.");
    }
    this.moduleLoader.stop(id, reason ?? "stop", { source: meta.source });
    return { ok: true, state: this.moduleLoader.getState(id) };
  }

  private handleModuleIsolate(
    payload: unknown,
    meta: KernelCommandMeta
  ): ModuleCommandResult {
    const { id, reason } = this.assertPayloadShape<{ id: string; reason?: string }>(
      payload,
      ["id"],
      "module.isolate"
    );
    if (typeof id !== "string" || id.length === 0) {
      throw new KernelBridgeError("module.isolate requires a non-empty id.");
    }
    this.moduleLoader.isolate(id, reason ?? "isolate", { source: meta.source });
    return { ok: true, state: this.moduleLoader.getState(id) };
  }

  private handleModuleReset(
    payload: unknown,
    meta: KernelCommandMeta
  ): ModuleCommandResult {
    const { id, reason } = this.assertPayloadShape<{ id: string; reason?: string }>(
      payload,
      ["id"],
      "module.reset"
    );
    if (typeof id !== "string" || id.length === 0) {
      throw new KernelBridgeError("module.reset requires a non-empty id.");
    }
    this.moduleLoader.reset(id, reason ?? "reset", { source: meta.source });
    return { ok: true, state: this.moduleLoader.getState(id) };
  }

  private handleCacheGet(
    payload: unknown,
    meta: KernelCommandMeta
  ): Promise<CacheGetResult> {
    const { key } = this.assertPayloadShape<{ key: string }>(payload, ["key"], "cache.get");
    if (typeof key !== "string" || key.length === 0) {
      throw new KernelBridgeError("cache.get requires a non-empty key.");
    }
    return this.cacheStore
      .get(key, { source: meta.source })
      .then((value) => ({ value: value ?? null }));
  }

  private handleCacheSet(
    payload: unknown,
    meta: KernelCommandMeta
  ): Promise<CacheSetResult> {
    const { key, value } = this.assertPayloadShape<{ key: string; value: unknown }>(
      payload,
      ["key", "value"],
      "cache.set"
    );
    if (typeof key !== "string" || key.length === 0) {
      throw new KernelBridgeError("cache.set requires a non-empty key.");
    }
    return this.cacheStore.set(key, value, { source: meta.source }).then(() => ({ ok: true }));
  }

  private handleSchemaBind(payload: unknown, meta: KernelCommandMeta): { ok: true } {
    const { key, validatorId } = this.assertPayloadShape<{
      key: string;
      validatorId: string;
    }>(payload, ["key", "validatorId"], "schema.bindValidator");
    if (typeof key !== "string" || key.length === 0) {
      throw new KernelBridgeError("schema.bindValidator requires a non-empty key.");
    }
    if (typeof validatorId !== "string" || validatorId.length === 0) {
      throw new KernelBridgeError("schema.bindValidator requires a validatorId.");
    }
    const validator = BUILTIN_VALIDATORS[validatorId];
    if (!validator) {
      throw new KernelBridgeError(`Unknown validatorId "${validatorId}".`);
    }
    this.schemaRegistry.bindValidator(key, validator, { source: meta.source });
    return { ok: true };
  }

  private handleHostModulesScan(
    payload: unknown,
    meta: KernelCommandMeta
  ): Promise<
    Array<{ manifestPath: string; ok: boolean; error?: string; manifestId?: string }>
  > {
    if (meta.source !== "kernel") {
      throw new KernelBridgeError("host.modules.scan is restricted to kernel.");
    }
    if (!this.host) {
      throw new KernelBridgeError("host.modules.scan requires a host adapter.");
    }
    const { baseDir } = this.assertPayloadShape<{ baseDir: string }>(
      payload,
      ["baseDir"],
      "host.modules.scan"
    );
    if (typeof baseDir !== "string" || baseDir.length === 0) {
      throw new KernelBridgeError("host.modules.scan requires a baseDir.");
    }
    return discoverModules(this.host, baseDir).then((entries) =>
      entries.map((entry) => {
        if (entry.error) {
          return { manifestPath: entry.manifestPath, ok: false, error: entry.error };
        }
        try {
          validateManifest(entry.manifestJson as ModuleManifest, this.eventBus);
          const manifestId = (entry.manifestJson as ModuleManifest).id;
          return { manifestPath: entry.manifestPath, ok: true, manifestId };
        } catch (error) {
          return {
            manifestPath: entry.manifestPath,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );
  }

  private assertMeta(meta: KernelCommandMeta): void {
    if (!meta?.source || typeof meta.source !== "string") {
      throw new KernelBridgeError("KernelBridge requires a source in meta.");
    }
  }

  private assertEmptyPayload(payload: unknown, command: string): void {
    if (payload && Object.keys(payload as Record<string, unknown>).length > 0) {
      throw new KernelBridgeError(`${command} does not accept a payload.`);
    }
  }

  private assertPayloadShape<T extends Record<string, unknown>>(
    payload: unknown,
    keys: string[],
    command: string
  ): T {
    if (!payload || typeof payload !== "object") {
      throw new KernelBridgeError(`${command} requires an object payload.`);
    }
    for (const key of keys) {
      if (!(key in (payload as Record<string, unknown>))) {
        throw new KernelBridgeError(`${command} missing "${key}".`);
      }
    }
    return payload as T;
  }
}
