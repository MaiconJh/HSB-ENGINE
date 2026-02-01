type EventHandler = (payload: unknown) => void;

type EventRecord = {
  name: string;
  payload: unknown;
  timestamp: number;
};

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private events: EventRecord[] = [];

  emit(name: string, payload: unknown): void {
    if (!name) {
      throw new Error("EventBus.emit requires a non-empty event name.");
    }

    const record: EventRecord = {
      name,
      payload,
      timestamp: Date.now(),
    };

    this.events.push(record);
    console.log(`[EventBus] emit "${name}"`, payload);

    const listeners = this.handlers.get(name);
    if (!listeners || listeners.size === 0) {
      return;
    }

    for (const handler of listeners) {
      handler(payload);
    }
  }

  listen(name: string, handler: EventHandler): () => void {
    if (!name) {
      throw new Error("EventBus.listen requires a non-empty event name.");
    }
    if (!handler) {
      throw new Error("EventBus.listen requires a handler.");
    }

    const listeners = this.handlers.get(name) ?? new Set<EventHandler>();
    listeners.add(handler);
    this.handlers.set(name, listeners);
    console.log(`[EventBus] listen "${name}"`);

    return () => {
      const existing = this.handlers.get(name);
      if (!existing || !existing.has(handler)) {
        throw new Error(
          `EventBus.listen cleanup failed: handler not registered for "${name}".`
        );
      }
      existing.delete(handler);
      if (existing.size === 0) {
        this.handlers.delete(name);
      }
      console.log(`[EventBus] unlisten "${name}"`);
    };
  }

  history(): EventRecord[] {
    return [...this.events];
  }
}
