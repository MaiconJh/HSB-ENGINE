import { EventContractError } from "./errors.ts";
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

const NAME_PATTERN = /^[a-z0-9_.:-]+$/;
const RESERVED_PREFIXES = ["kernel:", "system:", "diagnostic:"];

const MAX_HISTORY = 500;
const MAX_LISTENERS_PER_EVENT = 25;
const MAX_TOTAL_LISTENERS = 200;
const MAX_LISTENERS_PER_SOURCE = 50;
const STORM_WINDOW_MS = 1000;
const MAX_EMITS_PER_WINDOW = 100;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private listenerMeta = new Map<EventHandler, ListenerMeta>();
  private listenerCountBySource = new Map<string, number>();
  private totalListeners = 0;
  private events: EventRecord[] = [];
  private emitTimestamps: number[] = [];

  emit(name: string, payload: unknown, meta?: { source: string }): void {
    this.assertValidName(name);
    const source = meta?.source;
    if (!source) {
      throw new EventContractError("EventBus.emit requires a source.");
    }
    this.assertNamespaceAllowed(name, source);
    this.detectStorm();

    const record: EventRecord = {
      name,
      payload,
      timestamp: Date.now(),
      source,
    };

    this.recordEvent(record);
    logger.info("Event emitted", { name, source });

    const listeners = this.handlers.get(name);
    if (!listeners || listeners.size === 0) {
      return;
    }

    for (const handler of listeners) {
      try {
        handler(payload);
      } catch (error) {
        logger.error("Listener threw during emit", {
          name,
          source,
          error: error instanceof Error ? error.message : String(error),
        });
        this.recordEvent({
          name: "diagnostic:listener_error",
          payload: {
            event: name,
            source,
            error: error instanceof Error ? error.message : String(error),
          },
          timestamp: Date.now(),
          source: "kernel",
        });
      }
    }
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
        throw new EventContractError(
          `EventBus.listen cleanup failed for "${name}" (source "${source}").`
        );
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
      this.totalListeners -= 1;
      logger.info("Listener removed", { name, source });
    };
  }

  history(): EventRecord[] {
    return [...this.events];
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
        throw new EventContractError(
          `EventBus event "${name}" is reserved for kernel source.`
        );
      }
    }
  }

  private recordEvent(record: EventRecord): void {
    this.events.push(record);
    if (this.events.length > MAX_HISTORY) {
      this.events.splice(0, this.events.length - MAX_HISTORY);
    }
  }

  private detectStorm(): void {
    const now = Date.now();
    this.emitTimestamps.push(now);
    while (
      this.emitTimestamps.length > 0 &&
      now - this.emitTimestamps[0] > STORM_WINDOW_MS
    ) {
      this.emitTimestamps.shift();
    }
    if (this.emitTimestamps.length > MAX_EMITS_PER_WINDOW) {
      this.recordEvent({
        name: "diagnostic:event_storm",
        payload: {
          count: this.emitTimestamps.length,
          windowMs: STORM_WINDOW_MS,
        },
        timestamp: now,
        source: "kernel",
      });
      throw new EventContractError(
        `EventBus storm detected: ${this.emitTimestamps.length} emits in ${STORM_WINDOW_MS}ms.`
      );
    }
  }
}
