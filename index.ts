import { EventBus } from "./src/kernel/event-bus.ts";
import { CacheStore } from "./src/kernel/cache-store.ts";
import { ModuleLoader } from "./src/kernel/module-loader.ts";
import { PermissionSystem } from "./src/kernel/permission-system.ts";
import { WatchdogCore } from "./src/kernel/watchdog-core.ts";
import { dummyModule } from "./src/modules/dummy-module.ts";

const eventBus = new EventBus();
const permissionSystem = new PermissionSystem(eventBus);
eventBus.setPermissionChecker(permissionSystem);
const moduleLoader = new ModuleLoader(eventBus, permissionSystem);
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

const cacheStore = new CacheStore(permissionSystem);
cacheStore
  .set("boot", { ok: true }, { source: "kernel" })
  .then(() => cacheStore.get("boot", { source: "kernel" }))
  .then((value) => {
    console.log("[Kernel] CacheStore value", value);
  })
  .catch((error) => {
    console.error("[Kernel] CacheStore error", error);
  });
