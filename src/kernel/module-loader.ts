import { EventBus } from "./event-bus.ts";
import { ModuleLifecycleError } from "./errors.ts";
import { logger } from "./logger.ts";

export type ModuleContext = {
  moduleName: string;
  emit: (name: string, payload: unknown) => void;
  listen: (name: string, handler: (payload: unknown) => void) => () => void;
};

export type KernelModule = {
  name: string;
  start: (context: ModuleContext) => void;
  stop: (context: ModuleContext) => void;
};

type ModuleState = "registered" | "running" | "stopped";

const NAME_PATTERN = /^[a-z0-9_.:-]+$/;

export class ModuleLoader {
  private modules = new Map<string, KernelModule>();
  private states = new Map<string, ModuleState>();
  private eventBus: EventBus;

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
    if (state !== "registered") {
      throw new ModuleLifecycleError(
        `ModuleLoader.start module "${name}" not in registered state.`
      );
    }

    const context: ModuleContext = {
      moduleName: name,
      emit: (eventName: string, payload: unknown) =>
        this.eventBus.emit(eventName, payload, { source: name }),
      listen: (eventName: string, handler: (payload: unknown) => void) =>
        this.eventBus.listen(eventName, handler, { source: name }),
    };

    module.start(context);
    this.states.set(name, "running");
    logger.info("Module started", { name });
    this.eventBus.emit("kernel:module.started", { name }, { source: "kernel" });
  }

  stop(name: string): void {
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

    const context: ModuleContext = {
      moduleName: name,
      emit: (eventName: string, payload: unknown) =>
        this.eventBus.emit(eventName, payload, { source: name }),
      listen: (eventName: string, handler: (payload: unknown) => void) =>
        this.eventBus.listen(eventName, handler, { source: name }),
    };

    module.stop(context);
    this.states.set(name, "stopped");
    logger.info("Module stopped", { name });
    this.eventBus.emit("kernel:module.stopped", { name }, { source: "kernel" });
  }
}
