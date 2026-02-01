import { EventBus } from "./event-bus";

export type ModuleContext = {
  eventBus: EventBus;
};

export type KernelModule = {
  name: string;
  start: (context: ModuleContext) => void;
  stop: (context: ModuleContext) => void;
};

export class ModuleLoader {
  private modules = new Map<string, KernelModule>();
  private running = new Set<string>();

  constructor(private readonly context: ModuleContext) {}

  register(module: KernelModule): void {
    if (!module?.name) {
      throw new Error("ModuleLoader.register requires a module name.");
    }
    if (this.modules.has(module.name)) {
      throw new Error(`ModuleLoader.register duplicate module "${module.name}".`);
    }
    this.modules.set(module.name, module);
    console.log(`[ModuleLoader] registered "${module.name}"`);
  }

  start(name: string): void {
    const module = this.modules.get(name);
    if (!module) {
      throw new Error(`ModuleLoader.start unknown module "${name}".`);
    }
    if (this.running.has(name)) {
      throw new Error(`ModuleLoader.start module "${name}" already running.`);
    }

    module.start(this.context);
    this.running.add(name);
    console.log(`[ModuleLoader] started "${name}"`);
    this.context.eventBus.emit("module.started", { name });
  }

  stop(name: string): void {
    const module = this.modules.get(name);
    if (!module) {
      throw new Error(`ModuleLoader.stop unknown module "${name}".`);
    }
    if (!this.running.has(name)) {
      throw new Error(`ModuleLoader.stop module "${name}" is not running.`);
    }

    module.stop(this.context);
    this.running.delete(name);
    console.log(`[ModuleLoader] stopped "${name}"`);
    this.context.eventBus.emit("module.stopped", { name });
  }
}
