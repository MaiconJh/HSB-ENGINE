import type { CacheStore } from "./cache-store.ts";
import type { EventBus, EventRecord } from "./event-bus.ts";
import type { ModuleLoader } from "./module-loader.ts";
import type { SchemaRegistry } from "./schema-registry.ts";
import type { WatchdogCore } from "./watchdog-core.ts";

type LifecycleTransition = {
  timestamp: number;
  prevState: string;
  nextState: string;
  reason: string;
};

export type KernelSnapshot = {
  meta: {
    timestamp: number;
    version: string;
    uptimeMs?: number;
  };
  modules: Array<{
    id: string;
    state: string;
    manifest?: {
      id: string;
      version: string;
      permissionsCount: number;
      schemasCount: number;
    };
    lastLifecycleTransition?: LifecycleTransition;
  }>;
  eventBus: {
    historyTail: EventRecord[];
    counts: {
      totalHistory: number;
      listenerCount: number;
      queued: number;
      schemasRegistered: number;
    };
  };
  schemas: {
    declarations: Array<{ key: string; owner: string; description?: string }>;
    boundValidators: number;
  };
  watchdog?: {
    policy: { defaultPolicy: string; moduleOverrides: number };
    stats: Array<{
      moduleId: string;
      signalRateViolations: number;
      invariantViolations: number;
      consecutiveBursts: number;
    }>;
  };
  cache?: {
    size: number;
  };
};

export class KernelSnapshotter {
  private eventBus: EventBus;
  private moduleLoader: ModuleLoader;
  private watchdog?: WatchdogCore;
  private cacheStore?: CacheStore;
  private schemaRegistry: SchemaRegistry;
  private startTime = Date.now();

  constructor(options: {
    eventBus: EventBus;
    moduleLoader: ModuleLoader;
    schemaRegistry: SchemaRegistry;
    watchdog?: WatchdogCore;
    cacheStore?: CacheStore;
  }) {
    this.eventBus = options.eventBus;
    this.moduleLoader = options.moduleLoader;
    this.schemaRegistry = options.schemaRegistry;
    this.watchdog = options.watchdog;
    this.cacheStore = options.cacheStore;
  }

  snapshot(): KernelSnapshot {
    const history = this.eventBus.history();
    const historyTail = history.slice(-50);
    const lifecycleTransitions = this.collectLifecycleTransitions(history);
    const modules = this.moduleLoader.snapshot().map((module) => ({
      id: module.id,
      state: module.state,
      manifest: module.manifest,
      lastLifecycleTransition: lifecycleTransitions.get(module.id),
    }));
    const schemaSnapshot = this.schemaRegistry.snapshot();

    const snapshot: KernelSnapshot = {
      meta: {
        timestamp: Date.now(),
        version: "kernel-seed",
        uptimeMs: Date.now() - this.startTime,
      },
      modules,
      eventBus: {
        historyTail,
        counts: {
          totalHistory: history.length,
          listenerCount: this.eventBus.getListenerCount(),
          queued: this.eventBus.getQueueSize(),
          schemasRegistered: this.eventBus.getSchemaCount(),
        },
      },
      schemas: {
        declarations: schemaSnapshot.keys,
        boundValidators: schemaSnapshot.boundValidators,
      },
      watchdog: this.watchdog?.snapshot(),
      cache: this.cacheStore ? { size: this.cacheStore.getSize() } : undefined,
    };

    return snapshot;
  }

  private collectLifecycleTransitions(
    history: EventRecord[]
  ): Map<string, LifecycleTransition> {
    const transitions = new Map<string, LifecycleTransition>();
    for (const record of history) {
      if (record.name !== "kernel:lifecycle.transition") {
        continue;
      }
      const payload = record.payload as {
        moduleId?: string;
        prevState?: string;
        nextState?: string;
        reason?: string;
        timestamp?: number;
      };
      if (!payload?.moduleId) {
        continue;
      }
      transitions.set(payload.moduleId, {
        timestamp: payload.timestamp ?? record.timestamp,
        prevState: payload.prevState ?? "unknown",
        nextState: payload.nextState ?? "unknown",
        reason: payload.reason ?? "unknown",
      });
    }
    return transitions;
  }
}
