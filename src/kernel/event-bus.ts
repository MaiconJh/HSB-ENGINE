import { EventContractError, PermissionError } from "./errors.ts";
import { logger } from "./logger.ts";

type EventHandler = (payload: unknown) => void;

export type EventRecord = {
  name: string;
  payload: unknown;
  timestamp: number;
  source: string;
};

type ListenerMeta = {
  name: string;
  source: string;
};

type SchemaValidator = (payload: unknown) => { ok: boolean; error?: string };

type BackpressureConfig = {
  enabled: boolean;
  maxQueueSize: number;
  dropStrategy: "DROP_OLDEST" | "DROP_NEWEST";
  batchingWindowMs: number;
  maxBatchSize: number;
};

type EventBusConfig = {
  enableSchemaValidation: boolean;
  backpressure: BackpressureConfig;
};

type PermissionChecker = {
  assert: (
    source: string,
    perm: "event.emit_reserved" | "schema.register",
    context: { action: string; eventName?: string; target?: string }
  ) => void;
};

type QueueItem = {
  name: string;
  payload: unknown;
  source: string;
};

const NAME_PATTERN = /^[a-z0-9_.:-]+$/;
const RESERVED_PREFIXES = ["kernel:", "system:", "diagnostic:"];

const MAX_HISTORY = 500;
const MAX_LISTENERS_PER_EVENT = 25;
const MAX_TOTAL_LISTENERS = 200;
const MAX_LISTENERS_PER_SOURCE = 50;
const STORM_WINDOW_MS = 1000;
const MAX_EMITS_PER_WINDOW = 100;
const MAX_SOURCE_EMITS_PER_WINDOW = 60;
const DEFAULT_CONFIG: EventBusConfig = {
  enableSchemaValidation: false,
  backpressure: {
    enabled: false,
    maxQueueSize: 250,
    dropStrategy: "DROP_OLDEST",
    batchingWindowMs: 100,
    maxBatchSize: 50,
  },
};

export class EventBus {
  // Invariant: EventBus memory usage is bounded (history + queue).
  private handlers = new Map<string, Set<EventHandler>>();
  private listenerMeta = new Map<EventHandler, ListenerMeta>();
  private listenerCountBySource = new Map<string, number>();
  private totalListeners = 0;
  private events: EventRecord[] = [];
  private emitTimestamps: number[] = [];
  private emitTimestampsBySource = new Map<string, number[]>();
  private schemas = new Map<string, SchemaValidator>();
  private config: EventBusConfig;
  private permissionChecker?: PermissionChecker;
  private queue: QueueItem[] = [];
  private batching = new Map<string, QueueItem[]>();
  private batchingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private flushScheduled = false;

  constructor(config?: Partial<EventBusConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      backpressure: {
        ...DEFAULT_CONFIG.backpressure,
        ...(config?.backpressure ?? {}),
      },
    };
  }

  setPermissionChecker(checker: PermissionChecker): void {
    this.permissionChecker = checker;
  }

  emit(name: string, payload: unknown, meta?: { source: string }): void {
    this.assertValidName(name);
    const source = meta?.source;
    if (!source) {
      throw new EventContractError("EventBus.emit requires a source.");
    }
    this.assertNamespaceAllowed(name, source);

    if (this.config.enableSchemaValidation) {
      this.validateSchema(name, payload, source);
    }

    const item: QueueItem = { name, payload, source };
    if (this.config.backpressure.enabled) {
      this.enqueue(item);
      this.scheduleFlush();
      return;
    }

    this.deliver(item);
  }

  listen(
    name: string,
    handler: EventHandler,
    meta?: { source: string }
  ): () => void {
    this.assertValidName(name);
    if (!handler) {
      throw new EventContractError("EventBus.listen requires a handler.");
    }
    const source = meta?.source;
    if (!source) {
      throw new EventContractError("EventBus.listen requires a source.");
    }

    const currentTotal = this.totalListeners;
    if (currentTotal + 1 > MAX_TOTAL_LISTENERS) {
      throw new EventContractError(
        `EventBus.listen exceeds max total listeners (${MAX_TOTAL_LISTENERS}).`
      );
    }

    const listeners = this.handlers.get(name) ?? new Set<EventHandler>();
    if (listeners.size + 1 > MAX_LISTENERS_PER_EVENT) {
      throw new EventContractError(
        `EventBus.listen exceeds max listeners for "${name}" (${MAX_LISTENERS_PER_EVENT}).`
      );
    }

    const sourceCount = this.listenerCountBySource.get(source) ?? 0;
    if (sourceCount + 1 > MAX_LISTENERS_PER_SOURCE) {
      throw new EventContractError(
        `EventBus.listen exceeds max listeners for source "${source}" (${MAX_LISTENERS_PER_SOURCE}).`
      );
    }

    listeners.add(handler);
    this.handlers.set(name, listeners);
    this.listenerMeta.set(handler, { name, source });
    this.listenerCountBySource.set(source, sourceCount + 1);
    this.totalListeners += 1;
    logger.info("Listener registered", { name, source });

    return () => {
      const existing = this.handlers.get(name);
      const metaRecord = this.listenerMeta.get(handler);
      if (!existing || !existing.has(handler) || !metaRecord) {
        this.emitDiagnostic("diagnostic:listener_double_cleanup", {
          name,
          source,
        });
        return;
      }
      existing.delete(handler);
      if (existing.size === 0) {
        this.handlers.delete(name);
      }
      this.listenerMeta.delete(handler);
      const updatedSourceCount = (this.listenerCountBySource.get(source) ?? 1) - 1;
      if (updatedSourceCount <= 0) {
        this.listenerCountBySource.delete(source);
      } else {
        this.listenerCountBySource.set(source, updatedSourceCount);
      }
      this.totalListeners = Math.max(0, this.totalListeners - 1);
      logger.info("Listener removed", { name, source });
    };
  }

  history(): EventRecord[] {
    return [...this.events];
  }

  registerSchema(
    key: string,
    validator: SchemaValidator,
    meta?: { source: string }
  ): void {
    if (!key) {
      throw new EventContractError("EventBus.registerSchema requires a key.");
    }
    if (!validator) {
      throw new EventContractError("EventBus.registerSchema requires a validator.");
    }
    const source = meta?.source ?? "kernel";
    if (source !== "kernel") {
      if (!this.permissionChecker) {
        throw new PermissionError(
          `Permission denied: "${source}" missing "schema.register".`
        );
      }
      this.permissionChecker.assert(source, "schema.register", {
        action: "schema.register",
        target: key,
      });
    }
    this.schemas.set(key, validator);
  }

  emitBatched(
    name: string,
    payload: unknown,
    meta: { source: string; windowMs?: number }
  ): void {
    this.assertValidName(name);
    const source = meta?.source;
    if (!source) {
      throw new EventContractError("EventBus.emitBatched requires a source.");
    }
    if (!this.config.backpressure.enabled) {
      throw new EventContractError(
        "EventBus.emitBatched requires backpressure enabled."
      );
    }

    const key = `${source}:${name}`;
    const queue = this.batching.get(key) ?? [];
    if (queue.length + 1 > this.config.backpressure.maxBatchSize) {
      this.emitDiagnostic("diagnostic:backpressure_overflow", {
        name,
        source,
        reason: "batch_size_exceeded",
      });
      return;
    }
    queue.push({ name, payload, source });
    this.batching.set(key, queue);

    if (!this.batchingTimers.has(key)) {
      const windowMs = meta.windowMs ?? this.config.backpressure.batchingWindowMs;
      const timer = setTimeout(() => {
        const batch = this.batching.get(key);
        if (!batch || batch.length === 0) {
          this.batchingTimers.delete(key);
          return;
        }
        const combined = batch.map((entry) => entry.payload);
        this.batching.delete(key);
        this.batchingTimers.delete(key);
        this.enqueue({
          name,
          payload: combined,
          source,
        });
        this.scheduleFlush();
      }, windowMs);
      this.batchingTimers.set(key, timer);
    }
  }

  private assertValidName(name: string): void {
    if (!name) {
      throw new EventContractError("EventBus requires a non-empty event name.");
    }
    if (!NAME_PATTERN.test(name)) {
      throw new EventContractError(
        `EventBus name "${name}" violates naming contract.`
      );
    }
  }

  private assertNamespaceAllowed(name: string, source: string): void {
    if (RESERVED_PREFIXES.some((prefix) => name.startsWith(prefix))) {
      if (source !== "kernel") {
        if (name.startsWith("kernel:")) {
          throw new EventContractError(
            `EventBus event "${name}" is reserved for kernel source.`
          );
        }
        if (!this.permissionChecker) {
          throw new PermissionError(
            `Permission denied: "${source}" missing "event.emit_reserved".`
          );
        }
        this.permissionChecker.assert(source, "event.emit_reserved", {
          action: "event.emit_reserved",
          eventName: name,
        });
      }
    }
  }

  private recordEvent(record: EventRecord): void {
    this.events.push(record);
    if (this.events.length > MAX_HISTORY) {
      this.events.splice(0, this.events.length - MAX_HISTORY);
    }
  }

  private emitDiagnostic(name: string, payload: Record<string, unknown>): void {
    const record: EventRecord = {
      name,
      payload,
      timestamp: Date.now(),
      source: "kernel",
    };
    this.recordEvent(record);

    const listeners = this.handlers.get(name);
    if (!listeners || listeners.size === 0) {
      return;
    }
    for (const handler of listeners) {
      try {
        handler(payload);
      } catch (error) {
        logger.error("Listener threw during diagnostic emit", {
          name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private detectStorm(source: string): boolean {
    const now = Date.now();
    this.emitTimestamps.push(now);
    while (
      this.emitTimestamps.length > 0 &&
      now - this.emitTimestamps[0] > STORM_WINDOW_MS
    ) {
      this.emitTimestamps.shift();
    }
    if (this.emitTimestamps.length > MAX_EMITS_PER_WINDOW) {
      this.emitDiagnostic("diagnostic:event_storm", {
        count: this.emitTimestamps.length,
        windowMs: STORM_WINDOW_MS,
        source,
      });
      if (source === "kernel") {
        throw new EventContractError(
          `EventBus storm detected: ${this.emitTimestamps.length} emits in ${STORM_WINDOW_MS}ms.`
        );
      }
      return true;
    }
    return false;
  }

  private detectSourceStorm(source: string): void {
    const now = Date.now();
    const timestamps = this.emitTimestampsBySource.get(source) ?? [];
    timestamps.push(now);
    while (timestamps.length > 0 && now - timestamps[0] > STORM_WINDOW_MS) {
      timestamps.shift();
    }
    this.emitTimestampsBySource.set(source, timestamps);
    if (timestamps.length > MAX_SOURCE_EMITS_PER_WINDOW) {
      this.emitDiagnostic("diagnostic:signal_rate", {
        source,
        count: timestamps.length,
        windowMs: STORM_WINDOW_MS,
      });
    }
  }

  private validateSchema(name: string, payload: unknown, source: string): void {
    const validator = this.matchSchema(name, source);
    if (!validator) {
      return;
    }
    const result = validator(payload);
    if (!result.ok) {
      this.emitDiagnostic("diagnostic:schema_violation", {
        name,
        source,
        error: result.error ?? "schema_validation_failed",
      });
      throw new EventContractError(
        `EventBus schema violation for "${name}": ${result.error ?? "invalid"}.`
      );
    }
  }

  private matchSchema(name: string, source: string): SchemaValidator | undefined {
    if (this.schemas.has(name)) {
      return this.schemas.get(name);
    }
    const wildcardKey = `${source}:*`;
    if (this.schemas.has(wildcardKey)) {
      return this.schemas.get(wildcardKey);
    }
    if (this.schemas.has("kernel:*") && source === "kernel") {
      return this.schemas.get("kernel:*");
    }
    return undefined;
  }

  private enqueue(item: QueueItem): void {
    if (!this.config.backpressure.enabled) {
      return;
    }
    if (this.queue.length >= this.config.backpressure.maxQueueSize) {
      if (this.config.backpressure.dropStrategy === "DROP_NEWEST") {
        this.emitDiagnostic("diagnostic:backpressure_overflow", {
          name: item.name,
          source: item.source,
          strategy: "DROP_NEWEST",
        });
        return;
      }
      this.queue.shift();
      this.emitDiagnostic("diagnostic:backpressure_overflow", {
        name: item.name,
        source: item.source,
        strategy: "DROP_OLDEST",
      });
    }
    this.queue.push(item);
  }

  private flushQueue(): void {
    if (!this.config.backpressure.enabled) {
      return;
    }
    this.flushScheduled = false;
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) {
        continue;
      }
      this.deliver(item);
    }
  }

  private scheduleFlush(): void {
    if (this.flushScheduled) {
      return;
    }
    this.flushScheduled = true;
    setTimeout(() => {
      this.flushQueue();
    }, 0);
  }

  private deliver(item: QueueItem): void {
    const storm = this.detectStorm(item.source);
    if (storm && item.source !== "kernel") {
      return;
    }
    this.detectSourceStorm(item.source);

    const record: EventRecord = {
      name: item.name,
      payload: item.payload,
      timestamp: Date.now(),
      source: item.source,
    };

    this.recordEvent(record);
    logger.info("Event emitted", { name: item.name, source: item.source });

    const listeners = this.handlers.get(item.name);
    if (!listeners || listeners.size === 0) {
      return;
    }

    for (const handler of listeners) {
      try {
        handler(item.payload);
      } catch (error) {
        logger.error("Listener threw during emit", {
          name: item.name,
          source: item.source,
          error: error instanceof Error ? error.message : String(error),
        });
        this.emitDiagnostic("diagnostic:listener_error", {
          event: item.name,
          source: item.source,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
