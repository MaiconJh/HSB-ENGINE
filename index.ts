import { EventBus } from "./src/kernel/event-bus.ts";
import { CacheStore } from "./src/kernel/cache-store.ts";
import { MemoryHost } from "./src/host/memory-host.ts";
import { KernelBridge } from "./src/kernel/kernel-bridge.ts";
import { LocalKernelTransport } from "./src/kernel/kernel-transport.ts";
import { ModuleLoader } from "./src/kernel/module-loader.ts";
import type { ModuleDefinition } from "./src/kernel/manifest.ts";
import { PermissionSystem } from "./src/kernel/permission-system.ts";
import { SchemaRegistry } from "./src/kernel/schema-registry.ts";
import { KernelSnapshotter } from "./src/kernel/snapshot.ts";
import { WatchdogCore } from "./src/kernel/watchdog-core.ts";
import { dummyModule } from "./src/modules/dummy-module.ts";

const eventBus = new EventBus();
const permissionSystem = new PermissionSystem(eventBus);
const schemaRegistry = new SchemaRegistry(eventBus, permissionSystem);
eventBus.setPermissionChecker(permissionSystem);
const moduleLoader = new ModuleLoader(eventBus, permissionSystem, schemaRegistry);
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

const host = new MemoryHost();
const cacheStore = new CacheStore(permissionSystem, host);
const snapshotter = new KernelSnapshotter({
  eventBus,
  moduleLoader,
  schemaRegistry,
  watchdog,
  cacheStore,
});
console.log("[Kernel] Snapshot", snapshotter.snapshot());
const bridge = new KernelBridge({
  eventBus,
  moduleLoader,
  cacheStore,
  schemaRegistry,
  snapshotter,
});
const transport = new LocalKernelTransport(bridge);
transport
  .request("kernel.snapshot.get", {}, { source: "kernel" })
  .then((snapshot) => {
    console.log("[Kernel] Bridge snapshot", snapshot);
  });
cacheStore
  .set("boot", { ok: true }, { source: "kernel" })
  .then(() => cacheStore.get("boot", { source: "kernel" }))
  .then((value) => {
    console.log("[Kernel] CacheStore value", value);
  })
  .catch((error) => {
    console.error("[Kernel] CacheStore error", error);
  });
