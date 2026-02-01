import { EventBus } from "./src/kernel/event-bus.ts";
import { ModuleLoader } from "./src/kernel/module-loader.ts";
import { dummyModule } from "./src/modules/dummy-module.ts";

const eventBus = new EventBus();
const moduleLoader = new ModuleLoader(eventBus);

eventBus.listen(
  "kernel:module.started",
  (payload) => {
    console.log("[Kernel] module.started", payload);
  },
  { source: "kernel" }
);
eventBus.listen(
  "kernel:module.stopped",
  (payload) => {
    console.log("[Kernel] module.stopped", payload);
  },
  { source: "kernel" }
);

moduleLoader.register(dummyModule);
moduleLoader.start(dummyModule.name);

eventBus.emit("kernel.tick", { at: Date.now() }, { source: "kernel" });

moduleLoader.stop(dummyModule.name);

console.log("[Kernel] Event history", eventBus.history());
