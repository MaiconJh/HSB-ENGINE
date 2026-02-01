import { EventBus } from "./src/kernel/event-bus";
import { ModuleLoader } from "./src/kernel/module-loader";
import { dummyModule } from "./src/modules/dummy-module";

const eventBus = new EventBus();
const moduleLoader = new ModuleLoader({ eventBus });

eventBus.listen("module.started", (payload) => {
  console.log("[Kernel] module.started", payload);
});
eventBus.listen("module.stopped", (payload) => {
  console.log("[Kernel] module.stopped", payload);
});

moduleLoader.register(dummyModule);
moduleLoader.start(dummyModule.name);

eventBus.emit("kernel.tick", { at: Date.now() });

moduleLoader.stop(dummyModule.name);

console.log("[Kernel] Event history", eventBus.history());
