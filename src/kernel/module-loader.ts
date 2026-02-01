import { EventBus } from "./event-bus.ts";
import { ModuleLifecycleError } from "./errors.ts";
import { logger } from "./logger.ts";

export type ModuleContext = {
  moduleName: string;
  emit: (name: string, payload: unknown) => void;
  listen: (name: string, handler: (payload: unknown) => void) => () => void;
  setTimeout: (handler: () => void, ms: number) => NodeJS.Timeout;
  setInterval: (handler: () => void, ms: number) => NodeJS.Timeout;
  onDispose: (handler: () => void) => void;
  track: <T>(promise: Promise<T>, label: string) => Promise<T>;
};

export type KernelModule = {
  name: string;
  start: (context: ModuleContext) => void;
  stop: (context: ModuleContext) => void;
};

type ModuleState = "registered" | "running" | "stopped" | "error" | "isolated";

const NAME_PATTERN = /^[a-z0-9_.:-]+$/;

export class ModuleLoader {
  // Invariant: No module-owned resources survive stop/reload.
  private modules = new Map<string, KernelModule>();
  private states = new Map<string, ModuleState>();
  private eventBus: EventBus;
  private resources = new Map<
    string,
    {
      listeners: Array<() => void>;
      timers: Set<NodeJS.Timeout>;
      intervals: Set<NodeJS.Timeout>;
      disposers: Array<() => void>;
      trackedTasks: Map<string, Promise<unknown>>;
    }
  >();

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  register(module: KernelModule): void {
    if (!module?.name) {
      throw new ModuleLifecycleError("ModuleLoader.register requires a module name.");
    }
    if (!NAME_PATTERN.test(module.name)) {
      throw new ModuleLifecycleError(
        `ModuleLoader.register invalid module name "${module.name}".`
      );
    }
    if (this.modules.has(module.name)) {
      throw new ModuleLifecycleError(
        `ModuleLoader.register duplicate module "${module.name}".`
      );
    }
    this.modules.set(module.name, module);
    this.states.set(module.name, "registered");
    this.resources.set(module.name, {
      listeners: [],
      timers: new Set(),
      intervals: new Set(),
      disposers: [],
      trackedTasks: new Map(),
    });
    logger.info("Module registered", { name: module.name });
  }

  start(name: string): void {
    const module = this.modules.get(name);
    if (!module) {
      throw new ModuleLifecycleError(`ModuleLoader.start unknown module "${name}".`);
    }
    const state = this.states.get(name);
    if (state === "running") {
      throw new ModuleLifecycleError(
        `ModuleLoader.start module "${name}" already running.`
      );
    }
    if (state === "isolated" || state === "error") {
      throw new ModuleLifecycleError(
        `ModuleLoader.start module "${name}" is ${state} and cannot restart.`
      );
    }
    if (state !== "registered") {
      throw new ModuleLifecycleError(
        `ModuleLoader.start module "${name}" not in registered state.`
      );
    }

    const context: ModuleContext = this.createContext(name);
    this.emitLifecycle(name, "registered", "running", "start");
    this.states.set(name, "running");

    try {
      module.start(context);
    } catch (error) {
      this.states.set(name, "error");
      this.emitLifecycle(name, "running", "error", "start_failed");
      this.eventBus.emit(
        "diagnostic:module_error",
        {
          moduleId: name,
          phase: "start",
          error: error instanceof Error ? error.message : String(error),
        },
        { source: "kernel" }
      );
      throw new ModuleLifecycleError(
        `ModuleLoader.start failed for "${name}": ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (this.states.get(name) !== "running") {
      this.eventBus.emit(
        "diagnostic:module_start_aborted",
        {
          moduleId: name,
          state: this.states.get(name),
        },
        { source: "kernel" }
      );
      return;
    }

    logger.info("Module started", { name });
    this.eventBus.emit("kernel:module.started", { name }, { source: "kernel" });
  }

  stop(name: string, reason = "stop"): void {
    const module = this.modules.get(name);
    if (!module) {
      throw new ModuleLifecycleError(`ModuleLoader.stop unknown module "${name}".`);
    }
    const state = this.states.get(name);
    if (state !== "running") {
      throw new ModuleLifecycleError(
        `ModuleLoader.stop module "${name}" is not running.`
      );
    }

    const context: ModuleContext = this.createContext(name);
    this.emitLifecycle(name, "running", "stopped", reason);

    try {
      module.stop(context);
    } catch (error) {
      this.states.set(name, "error");
      this.emitLifecycle(name, "running", "error", "stop_failed");
      this.eventBus.emit(
        "diagnostic:module_error",
        {
          moduleId: name,
          phase: "stop",
          error: error instanceof Error ? error.message : String(error),
        },
        { source: "kernel" }
      );
      throw new ModuleLifecycleError(
        `ModuleLoader.stop failed for "${name}": ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.teardownResources(name);
    }

    this.states.set(name, "stopped");
    logger.info("Module stopped", { name });
    this.eventBus.emit("kernel:module.stopped", { name }, { source: "kernel" });
  }

  isolate(name: string, reason = "isolate"): void {
    const state = this.states.get(name);
    if (!state) {
      throw new ModuleLifecycleError(`ModuleLoader.isolate unknown module "${name}".`);
    }
    if (state === "isolated") {
      throw new ModuleLifecycleError(
        `ModuleLoader.isolate module "${name}" already isolated.`
      );
    }
    if (state === "running") {
      this.stop(name, reason);
    }
    this.states.set(name, "isolated");
    this.emitLifecycle(name, state, "isolated", reason);
    this.eventBus.emit("kernel:module.isolated", { name }, { source: "kernel" });
  }

  reset(name: string, reason = "reset"): void {
    const state = this.states.get(name);
    if (!state) {
      throw new ModuleLifecycleError(`ModuleLoader.reset unknown module "${name}".`);
    }
    if (state !== "isolated" && state !== "error") {
      throw new ModuleLifecycleError(
        `ModuleLoader.reset module "${name}" not in isolated/error state.`
      );
    }
    this.states.set(name, "registered");
    this.emitLifecycle(name, state, "registered", reason);
    this.eventBus.emit("kernel:module.reset", { name }, { source: "kernel" });
  }

  getState(name: string): ModuleState | undefined {
    return this.states.get(name);
  }

  private createContext(name: string): ModuleContext {
    const record = this.resources.get(name);
    if (!record) {
      throw new ModuleLifecycleError(`ModuleLoader context missing for "${name}".`);
    }
    return {
      moduleName: name,
      emit: (eventName: string, payload: unknown) =>
        this.eventBus.emit(eventName, payload, { source: name }),
      listen: (eventName: string, handler: (payload: unknown) => void) =>
        this.trackListener(name, this.eventBus.listen(eventName, handler, { source: name })),
      setTimeout: (handler: () => void, ms: number) =>
        this.trackTimer(name, setTimeout(handler, ms)),
      setInterval: (handler: () => void, ms: number) =>
        this.trackInterval(name, setInterval(handler, ms)),
      onDispose: (handler: () => void) => {
        record.disposers.push(handler);
      },
      track: <T>(promise: Promise<T>, label: string) => {
        record.trackedTasks.set(label, promise);
        promise.finally(() => record.trackedTasks.delete(label)).catch(() => undefined);
        return promise;
      },
    };
  }

  private trackListener(name: string, unsubscribe: () => void): () => void {
    const record = this.resources.get(name);
    if (!record) {
      throw new ModuleLifecycleError(`ModuleLoader listener missing for "${name}".`);
    }
    let active = true;
    const wrapped = () => {
      if (!active) {
        return;
      }
      active = false;
      try {
        unsubscribe();
      } finally {
        record.listeners = record.listeners.filter((entry) => entry !== wrapped);
      }
    };
    record.listeners.push(wrapped);
    return wrapped;
  }

  private trackTimer(name: string, timer: NodeJS.Timeout): NodeJS.Timeout {
    const record = this.resources.get(name);
    if (!record) {
      throw new ModuleLifecycleError(`ModuleLoader timer missing for "${name}".`);
    }
    record.timers.add(timer);
    return timer;
  }

  private trackInterval(name: string, timer: NodeJS.Timeout): NodeJS.Timeout {
    const record = this.resources.get(name);
    if (!record) {
      throw new ModuleLifecycleError(`ModuleLoader interval missing for "${name}".`);
    }
    record.intervals.add(timer);
    return timer;
  }

  private teardownResources(name: string): void {
    const record = this.resources.get(name);
    if (!record) {
      return;
    }

    const listenerCount = record.listeners.length;
    for (const unsubscribe of record.listeners) {
      try {
        unsubscribe();
      } catch (error) {
        this.eventBus.emit(
          "diagnostic:dispose_error",
          {
            moduleId: name,
            type: "listener",
            error: error instanceof Error ? error.message : String(error),
          },
          { source: "kernel" }
        );
      }
    }
    record.listeners = [];

    for (const timer of record.timers) {
      clearTimeout(timer);
    }
    record.timers.clear();

    for (const timer of record.intervals) {
      clearInterval(timer);
    }
    record.intervals.clear();

    const disposers = [...record.disposers].reverse();
    record.disposers = [];
    for (const dispose of disposers) {
      try {
        dispose();
      } catch (error) {
        this.eventBus.emit(
          "diagnostic:dispose_error",
          {
            moduleId: name,
            type: "dispose",
            error: error instanceof Error ? error.message : String(error),
          },
          { source: "kernel" }
        );
      }
    }

    if (record.trackedTasks.size > 0) {
      this.eventBus.emit(
        "diagnostic:task_leak",
        {
          moduleId: name,
          pending: Array.from(record.trackedTasks.keys()),
        },
        { source: "kernel" }
      );
      record.trackedTasks.clear();
    }

    this.eventBus.emit(
      "diagnostic:teardown_cleanup",
      {
        moduleId: name,
        listeners: listenerCount,
      },
      { source: "kernel" }
    );
  }

  private emitLifecycle(
    moduleId: string,
    prevState: ModuleState | undefined,
    nextState: ModuleState,
    reason: string
  ): void {
    this.eventBus.emit(
      "kernel:lifecycle.transition",
      {
        moduleId,
        prevState: prevState ?? "unregistered",
        nextState,
        reason,
        timestamp: Date.now(),
      },
      { source: "kernel" }
    );
  }
}
