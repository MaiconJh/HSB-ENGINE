import { EventBus } from "./src/kernel/event-bus.ts";
import { CacheStore } from "./src/kernel/cache-store.ts";
import { ModuleLoader } from "./src/kernel/module-loader.ts";
import type { ModuleDefinition } from "./src/kernel/manifest.ts";
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

const dummyDefinition: ModuleDefinition = {
  manifest: {
    id: dummyModule.name,
    version: "1.0.0",
    permissions: [],
    displayName: "Dummy Module",
    schemas: [{ key: "dummy.started" }, { key: "dummy.stopped" }],
  },
  module: dummyModule,
};

moduleLoader.register(dummyDefinition);
const manifest = moduleLoader.getManifest(dummyModule.name);
if (manifest?.schemas?.length) {
  console.log("[Kernel] Module schemas declared", {
    moduleId: manifest.id,
    schemas: manifest.schemas.map((schema) => schema.key),
  });
}
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
