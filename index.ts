import { EventBus } from "./src/kernel/event-bus.ts";
import { CacheStore } from "./src/kernel/cache-store.ts";
import { ModuleLoader } from "./src/kernel/module-loader.ts";
import { WatchdogCore } from "./src/kernel/watchdog-core.ts";
import { dummyModule } from "./src/modules/dummy-module.ts";

const eventBus = new EventBus();
const moduleLoader = new ModuleLoader(eventBus);
const watchdog = new WatchdogCore(eventBus, moduleLoader, {
  defaultPolicy: "WARN",
});
watchdog.start();

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

const cacheStore = new CacheStore();
cacheStore
  .set("boot", { ok: true })
  .then(() => cacheStore.get("boot"))
  .then((value) => {
    console.log("[Kernel] CacheStore value", value);
  })
  .catch((error) => {
    console.error("[Kernel] CacheStore error", error);
  });
