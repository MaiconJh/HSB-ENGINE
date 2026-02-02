import { CacheStore } from "../src/kernel/cache-store.ts";
import { EventBus } from "../src/kernel/event-bus.ts";
import { MemoryHost } from "../src/host/memory-host.ts";
import { KernelBridge } from "../src/kernel/kernel-bridge.ts";
import type { KernelCommandName } from "../src/kernel/kernel-bridge.ts";
import { LocalKernelTransport } from "../src/kernel/kernel-transport.ts";
import { ModuleLoader } from "../src/kernel/module-loader.ts";
import { PermissionSystem } from "../src/kernel/permission-system.ts";
import { SchemaRegistry } from "../src/kernel/schema-registry.ts";
import { KernelSnapshotter } from "../src/kernel/snapshot.ts";
import { WatchdogCore } from "../src/kernel/watchdog-core.ts";
import { dummyModule } from "../src/modules/dummy-module.ts";
import type { ModuleDefinition } from "../src/kernel/manifest.ts";
import type { ModuleContext } from "../src/kernel/module-loader.ts";
import {
  EventContractError,
  CacheError,
  KernelBridgeError,
  ManifestError,
  ModuleLifecycleError,
  PermissionError,
  SchemaContractError,
} from "../src/kernel/errors.ts";

type Assertion = {
  name: string;
  passed: boolean;
  message?: string;
};

const assertions: Assertion[] = [];
const pendingChecks: Promise<void>[] = [];

const assertThrows = (name: string, fn: () => void, errorType: Function) => {
  try {
    fn();
    assertions.push({ name, passed: false, message: "Expected error not thrown." });
  } catch (error) {
    if (error instanceof errorType) {
      assertions.push({ name, passed: true });
      return;
    }
    assertions.push({
      name,
      passed: false,
      message: `Wrong error type: ${error instanceof Error ? error.name : "unknown"}`,
    });
  }
};

const assertTrue = (name: string, condition: boolean, message?: string) => {
  assertions.push({ name, passed: condition, message });
};

const assertRejects = (name: string, promise: Promise<unknown>, errorType: Function) => {
  const check = promise
    .then(() => {
      assertions.push({ name, passed: false, message: "Expected rejection not thrown." });
    })
    .catch((error) => {
      if (error instanceof errorType) {
        assertions.push({ name, passed: true });
        return;
      }
      assertions.push({
        name,
        passed: false,
        message: `Wrong error type: ${error instanceof Error ? error.name : "unknown"}`,
      });
    });
  pendingChecks.push(check);
};

const eventBus = new EventBus();
const permissionSystem = new PermissionSystem(eventBus);
eventBus.setPermissionChecker(permissionSystem);
const schemaRegistry = new SchemaRegistry(eventBus, permissionSystem);
const moduleLoader = new ModuleLoader(eventBus, permissionSystem, schemaRegistry);
const watchdog = new WatchdogCore(eventBus, moduleLoader, {
  defaultPolicy: "WARN",
  modulePolicies: {
    "stormy-module": "CONTAIN",
  },
});
watchdog.start();

assertThrows(
  "start before register throws",
  () => moduleLoader.start("missing-module"),
  ModuleLifecycleError
);

moduleLoader.register(dummyModule);

assertThrows(
  "double register throws",
  () => moduleLoader.register(dummyModule),
  ModuleLifecycleError
);

moduleLoader.start(dummyModule.name);

assertThrows(
  "double start throws",
  () => moduleLoader.start(dummyModule.name),
  ModuleLifecycleError
);

eventBus.emit("kernel.tick", { ok: true }, { source: "kernel" });

assertThrows(
  "reserved namespace from module is blocked",
  () => eventBus.emit("kernel:forbidden", {}, { source: "dummy-module" }),
  EventContractError
);

assertThrows(
  "invalid event name blocked",
  () => eventBus.emit("Invalid Name", {}, { source: "kernel" }),
  EventContractError
);

moduleLoader.stop(dummyModule.name);

assertThrows(
  "stop twice throws",
  () => moduleLoader.stop(dummyModule.name),
  ModuleLifecycleError
);

const leakyModule = {
  name: "leaky-module",
  start: (context: ModuleContext) => {
    context.listen("leaky.event", () => undefined);
    context.setInterval(() => undefined, 1000);
    context.onDispose(() => {
      throw new Error("dispose failure");
    });
  },
  stop: () => {
    // Intentionally missing cleanup.
  },
};

moduleLoader.register(leakyModule);
moduleLoader.start(leakyModule.name);
moduleLoader.stop(leakyModule.name);

const teardownDiagnostics = eventBus
  .history()
  .filter((entry) => entry.name === "diagnostic:teardown_cleanup");
assertTrue(
  "teardown cleanup emitted",
  teardownDiagnostics.some((entry) => (entry.payload as { moduleId?: string }).moduleId === "leaky-module")
);

const disposeDiagnostics = eventBus
  .history()
  .filter((entry) => entry.name === "diagnostic:dispose_error");
assertTrue(
  "dispose error recorded",
  disposeDiagnostics.some((entry) => (entry.payload as { moduleId?: string }).moduleId === "leaky-module")
);

const stormyModule = {
  name: "stormy-module",
  start: (context: ModuleContext) => {
    for (let i = 0; i < 61; i += 1) {
      context.emit("stormy.signal", { count: i });
    }
  },
  stop: () => undefined,
};

moduleLoader.register(stormyModule);
moduleLoader.start(stormyModule.name);

const stormState = moduleLoader.getState(stormyModule.name);
assertTrue("watchdog containment stops module", stormState === "stopped");

const kernelProtectionBus = new EventBus();
const kernelProtectionLoader = new ModuleLoader(kernelProtectionBus);
const kernelProtectionWatchdog = new WatchdogCore(kernelProtectionBus, kernelProtectionLoader, {
  defaultPolicy: "CONTAIN",
});
kernelProtectionWatchdog.start();
kernelProtectionBus.emit(
  "diagnostic:event_storm",
  { count: 999, windowMs: 1, source: "kernel" },
  { source: "kernel" }
);
const kernelWarnings = kernelProtectionBus
  .history()
  .filter((entry) => entry.name === "diagnostic:watchdog_warning");
const kernelContain = kernelProtectionBus
  .history()
  .filter((entry) => entry.name === "diagnostic:watchdog_contain");
assertTrue(
  "kernel watchdog protection warns",
  kernelWarnings.some(
    (entry) =>
      (entry.payload as { reason?: string }).reason === "kernel_protected"
  )
);
assertTrue("kernel watchdog protection prevents contain", kernelContain.length === 0);

const stormBus = new EventBus();
let moduleStormThrew = false;
try {
  for (let i = 0; i < 110; i += 1) {
    stormBus.emit("storm.event", { count: i }, { source: "module-storm" });
  }
} catch {
  moduleStormThrew = true;
}
assertTrue("module storm does not throw", moduleStormThrew === false);
const stormDiagnostics = stormBus
  .history()
  .filter((entry) => entry.name === "diagnostic:event_storm");
assertTrue("module storm emits diagnostic", stormDiagnostics.length > 0);

assertThrows(
  "kernel storm throws",
  () => {
    for (let i = 0; i < 110; i += 1) {
      stormBus.emit("storm.event", { count: i }, { source: "kernel" });
    }
  },
  EventContractError
);

const schemaBus = new EventBus({ enableSchemaValidation: true });
const schemaPermissions = new PermissionSystem(schemaBus);
schemaBus.setPermissionChecker(schemaPermissions);
schemaBus.registerSchema("schema:event", (payload) => ({
  ok: typeof (payload as { ok?: boolean }).ok === "boolean",
  error: "ok must be boolean",
}));

assertThrows(
  "schema violation throws",
  () => schemaBus.emit("schema:event", { ok: "nope" }, { source: "kernel" }),
  EventContractError
);

const schemaDiagnostics = schemaBus
  .history()
  .filter((entry) => entry.name === "diagnostic:schema_violation");
assertTrue("schema diagnostic recorded", schemaDiagnostics.length > 0);

const backpressureBus = new EventBus({
  backpressure: {
    enabled: true,
    maxQueueSize: 1,
    dropStrategy: "DROP_NEWEST",
    batchingWindowMs: 10,
    maxBatchSize: 2,
  },
});
const backpressurePermissions = new PermissionSystem(backpressureBus);
backpressureBus.setPermissionChecker(backpressurePermissions);

backpressureBus.emit("bp.event", { id: 1 }, { source: "kernel" });
backpressureBus.emit("bp.event", { id: 2 }, { source: "kernel" });
backpressureBus.emit("bp.event", { id: 3 }, { source: "kernel" });

const batchedBus = new EventBus({
  backpressure: {
    enabled: true,
    maxQueueSize: 50,
    dropStrategy: "DROP_OLDEST",
    batchingWindowMs: 10,
    maxBatchSize: 200,
  },
});
const batchedPermissions = new PermissionSystem(batchedBus);
batchedBus.setPermissionChecker(batchedPermissions);
for (let i = 0; i < 200; i += 1) {
  batchedBus.emitBatched("batch.event", { index: i }, { source: "batcher" });
}

const unsubscribeBus = new EventBus();
const unsubscribePermissions = new PermissionSystem(unsubscribeBus);
unsubscribeBus.setPermissionChecker(unsubscribePermissions);
const unsubscribe = unsubscribeBus.listen(
  "idempotent.event",
  () => undefined,
  { source: "kernel" }
);
unsubscribe();
unsubscribe();
assertTrue("unsubscribe idempotent", true);

const permissionBus = new EventBus();
const permissionSystemLocal = new PermissionSystem(permissionBus);
permissionBus.setPermissionChecker(permissionSystemLocal);

assertThrows(
  "reserved event blocked without permission",
  () => permissionBus.emit("system:notice", { ok: true }, { source: "module-a" }),
  PermissionError
);
permissionSystemLocal.grant("module-a", ["event.emit_reserved"]);
permissionBus.emit("system:notice", { ok: true }, { source: "module-a" });
assertThrows(
  "kernel prefix blocked even with reserved permission",
  () => permissionBus.emit("kernel:notice", { ok: true }, { source: "module-a" }),
  EventContractError
);

const controlBus = new EventBus();
const controlPermissions = new PermissionSystem(controlBus);
controlBus.setPermissionChecker(controlPermissions);
const controlLoader = new ModuleLoader(controlBus, controlPermissions);
controlLoader.register(dummyModule);
controlLoader.start(dummyModule.name);
assertThrows(
  "kernel control blocked without permission",
  () => controlLoader.stop(dummyModule.name, "test", { source: "module-a" }),
  PermissionError
);
controlPermissions.grant("module-a", ["kernel.control"]);
controlLoader.stop(dummyModule.name, "test", { source: "module-a" });

const cacheBus = new EventBus();
const cachePermissions = new PermissionSystem(cacheBus);
cacheBus.setPermissionChecker(cachePermissions);
const cacheStore = new CacheStore(cachePermissions);
assertRejects(
  "storage write blocked without permission",
  cacheStore.set("denied", { ok: false }, { source: "module-a" }),
  PermissionError
);
cachePermissions.grant("module-a", ["storage.write", "storage.read"]);
pendingChecks.push(
  cacheStore.set("allowed", { ok: true }, { source: "module-a" }).then(() => {
    assertions.push({ name: "storage write allowed", passed: true });
  })
);
pendingChecks.push(
  cacheStore.get("allowed", { source: "module-a" }).then((value) => {
    assertions.push({
      name: "storage read allowed",
      passed: (value as { ok?: boolean })?.ok === true,
    });
  })
);

const schemaPermissionBus = new EventBus();
const schemaPermissionSystem = new PermissionSystem(schemaPermissionBus);
schemaPermissionBus.setPermissionChecker(schemaPermissionSystem);
assertThrows(
  "schema registration blocked without permission",
  () =>
    schemaPermissionBus.registerSchema(
      "module:schema",
      () => ({ ok: true }),
      { source: "module-a" }
    ),
  PermissionError
);
schemaPermissionSystem.grant("module-a", ["schema.register"]);
schemaPermissionBus.registerSchema(
  "module:schema",
  () => ({ ok: true }),
  { source: "module-a" }
);

const permissionDiagnostics = permissionBus
  .history()
  .filter((entry) => entry.name === "diagnostic:permission_violation");
assertTrue("permission violation diagnostics recorded", permissionDiagnostics.length > 0);

const manifestBus = new EventBus();
const manifestPermissions = new PermissionSystem(manifestBus);
manifestBus.setPermissionChecker(manifestPermissions);
const manifestRegistry = new SchemaRegistry(manifestBus, manifestPermissions);
const manifestLoader = new ModuleLoader(
  manifestBus,
  manifestPermissions,
  manifestRegistry
);
const permModuleDefinition: ModuleDefinition = {
  manifest: {
    id: "perm-module",
    version: "1.0.0",
    permissions: ["event.emit_reserved"],
    schemas: [{ key: "declared:event", description: "Declared schema event" }],
  },
  module: {
    name: "perm-module",
    start: (context: ModuleContext) => {
      context.emit("system:test", { ok: true });
    },
    stop: () => undefined,
  },
};
manifestLoader.register(permModuleDefinition);
let permModuleStarted = false;
try {
  manifestLoader.start("perm-module");
  permModuleStarted = true;
} catch {
  permModuleStarted = false;
}
assertTrue("manifest permissions grant reserved emit", permModuleStarted);
const manifestSnapshot = manifestRegistry.snapshot();
assertTrue(
  "manifest schema declarations registered",
  manifestSnapshot.keys.some(
    (entry) => entry.key === "declared:event" && entry.owner === "perm-module"
  )
);

const invalidManifestDefinition: ModuleDefinition = {
  manifest: {
    id: "",
    version: "1.0.0",
    permissions: [],
  },
  module: {
    name: "invalid-manifest",
    start: () => undefined,
    stop: () => undefined,
  },
};
assertThrows(
  "invalid manifest rejected",
  () => manifestLoader.register(invalidManifestDefinition),
  ManifestError
);
const manifestDiagnostics = manifestBus
  .history()
  .filter((entry) => entry.name === "diagnostic:manifest_invalid");
assertTrue("manifest invalid diagnostic recorded", manifestDiagnostics.length > 0);

assertThrows(
  "binding undeclared schema rejected",
  () =>
    manifestRegistry.bindValidator(
      "undeclared:event",
      () => ({ ok: true }),
      { source: "kernel" }
    ),
  SchemaContractError
);
const undeclaredDiagnostics = manifestBus
  .history()
  .filter((entry) => entry.name === "diagnostic:schema_undeclared");
assertTrue("schema undeclared diagnostic recorded", undeclaredDiagnostics.length > 0);

const schemaValidationBus = new EventBus({ enableSchemaValidation: true });
const schemaValidationPermissions = new PermissionSystem(schemaValidationBus);
schemaValidationBus.setPermissionChecker(schemaValidationPermissions);
const schemaValidationRegistry = new SchemaRegistry(
  schemaValidationBus,
  schemaValidationPermissions
);
const schemaValidationLoader = new ModuleLoader(
  schemaValidationBus,
  schemaValidationPermissions,
  schemaValidationRegistry
);
schemaValidationLoader.register({
  manifest: {
    id: "schema-module",
    version: "1.0.0",
    permissions: [],
    schemas: [{ key: "schema:checked" }],
  },
  module: {
    name: "schema-module",
    start: () => undefined,
    stop: () => undefined,
  },
});
schemaValidationRegistry.bindValidator(
  "schema:checked",
  (payload) => ({
    ok: typeof (payload as { ok?: boolean }).ok === "boolean",
    error: "ok must be boolean",
  }),
  { source: "kernel" }
);
assertThrows(
  "schema validator enforcement works",
  () => schemaValidationBus.emit("schema:checked", { ok: "nope" }, { source: "kernel" }),
  EventContractError
);
const schemaValidationDiagnostics = schemaValidationBus
  .history()
  .filter((entry) => entry.name === "diagnostic:schema_violation");
assertTrue(
  "schema validator enforcement diagnostic recorded",
  schemaValidationDiagnostics.length > 0
);

const permissionValidationBus = new EventBus();
const permissionValidationPermissions = new PermissionSystem(permissionValidationBus);
permissionValidationBus.setPermissionChecker(permissionValidationPermissions);
const permissionValidationRegistry = new SchemaRegistry(
  permissionValidationBus,
  permissionValidationPermissions
);
permissionValidationRegistry.registerDeclarations("owner-module", [
  { key: "schema:bound" },
]);
assertThrows(
  "schema validator binding requires permission",
  () =>
    permissionValidationRegistry.bindValidator(
      "schema:bound",
      () => ({ ok: true }),
      { source: "module-a" }
    ),
  PermissionError
);
const permissionBindingDiagnostics = permissionValidationBus
  .history()
  .filter((entry) => entry.name === "diagnostic:permission_violation");
assertTrue(
  "schema validator permission violation diagnostic recorded",
  permissionBindingDiagnostics.length > 0
);

const snapshotBus = new EventBus();
const snapshotPermissions = new PermissionSystem(snapshotBus);
snapshotBus.setPermissionChecker(snapshotPermissions);
const snapshotRegistry = new SchemaRegistry(snapshotBus, snapshotPermissions);
const snapshotLoader = new ModuleLoader(snapshotBus, snapshotPermissions, snapshotRegistry);
const snapshotWatchdog = new WatchdogCore(snapshotBus, snapshotLoader, {
  defaultPolicy: "WARN",
});
snapshotWatchdog.start();
const snapshotCache = new CacheStore(snapshotPermissions);
const snapshotter = new KernelSnapshotter({
  eventBus: snapshotBus,
  moduleLoader: snapshotLoader,
  schemaRegistry: snapshotRegistry,
  watchdog: snapshotWatchdog,
  cacheStore: snapshotCache,
});
const snapshotDefinition: ModuleDefinition = {
  manifest: {
    id: "snapshot-module",
    version: "1.0.0",
    permissions: [],
  },
  module: {
    name: "snapshot-module",
    start: (context: ModuleContext) => {
      context.emit("snapshot:event", { ok: true });
    },
    stop: () => undefined,
  },
};
snapshotLoader.register(snapshotDefinition);
snapshotLoader.start("snapshot-module");
const runningSnapshot = snapshotter.snapshot();
assertTrue(
  "snapshot includes running module",
  runningSnapshot.modules.some((entry) => entry.id === "snapshot-module" && entry.state === "running")
);
snapshotLoader.stop("snapshot-module");
const stoppedSnapshot = snapshotter.snapshot();
assertTrue(
  "snapshot includes stopped module",
  stoppedSnapshot.modules.some((entry) => entry.id === "snapshot-module" && entry.state === "stopped")
);
snapshotLoader.isolate("snapshot-module");
const isolatedSnapshot = snapshotter.snapshot();
assertTrue(
  "snapshot includes isolated module",
  isolatedSnapshot.modules.some(
    (entry) => entry.id === "snapshot-module" && entry.state === "isolated"
  )
);
for (let i = 0; i < 70; i += 1) {
  snapshotBus.emit("snapshot:noise", { index: i }, { source: "snapshot-module" });
}
const boundedSnapshot = snapshotter.snapshot();
assertTrue("snapshot history tail bounded", boundedSnapshot.eventBus.historyTail.length <= 50);
assertTrue("snapshot total history exceeds tail", boundedSnapshot.eventBus.counts.totalHistory > 50);
assertTrue("snapshot has meta", Boolean(boundedSnapshot.meta));
assertTrue("snapshot has modules", Array.isArray(boundedSnapshot.modules));
assertTrue("snapshot has eventBus", Boolean(boundedSnapshot.eventBus));
assertTrue("snapshot has schemas", Boolean(boundedSnapshot.schemas));
const snapshotJson = JSON.stringify(boundedSnapshot);
assertTrue("snapshot JSON safe", snapshotJson.length > 0);
pendingChecks.push(
  snapshotCache.set("secret", "top-secret", { source: "kernel" }).then(() => {
    const cacheSnapshot = snapshotter.snapshot();
    const cacheJson = JSON.stringify(cacheSnapshot);
    assertTrue("snapshot includes cache size", cacheSnapshot.cache?.size === 1);
    assertTrue("snapshot omits cache values", !cacheJson.includes("top-secret"));
  })
);

const bridgeBus = new EventBus();
const bridgePermissions = new PermissionSystem(bridgeBus);
bridgeBus.setPermissionChecker(bridgePermissions);
const bridgeRegistry = new SchemaRegistry(bridgeBus, bridgePermissions);
const bridgeLoader = new ModuleLoader(bridgeBus, bridgePermissions, bridgeRegistry);
const bridgeHost = new MemoryHost();
const bridgeCache = new CacheStore(bridgePermissions, bridgeHost);
const bridgeSnapshotter = new KernelSnapshotter({
  eventBus: bridgeBus,
  moduleLoader: bridgeLoader,
  schemaRegistry: bridgeRegistry,
});
const bridge = new KernelBridge({
  eventBus: bridgeBus,
  moduleLoader: bridgeLoader,
  cacheStore: bridgeCache,
  schemaRegistry: bridgeRegistry,
  snapshotter: bridgeSnapshotter,
});
const transport = new LocalKernelTransport(bridge);

const bridgeSnapshot = bridge.dispatch("kernel.snapshot.get", {}, { source: "kernel" });
assertTrue("bridge snapshot JSON safe", JSON.stringify(bridgeSnapshot).length > 0);
pendingChecks.push(
  transport.request("kernel.snapshot.get", {}, { source: "kernel" }).then((snapshot) => {
    assertTrue("transport snapshot JSON safe", JSON.stringify(snapshot).length > 0);
  })
);

bridgeLoader.register(dummyModule);
bridgeLoader.start(dummyModule.name);
assertThrows(
  "bridge module.stop enforces permission",
  () => bridge.dispatch("module.stop", { id: dummyModule.name }, { source: "module-a" }),
  PermissionError
);
bridge.dispatch("module.stop", { id: dummyModule.name }, { source: "kernel" });

assertThrows(
  "bridge event.emit blocks kernel namespace",
  () =>
    bridge.dispatch(
      "event.emit",
      { name: "kernel:forbidden", payload: {} },
      { source: "module-a" }
    ),
  EventContractError
);
assertThrows(
  "bridge event.emit blocks reserved without permission",
  () =>
    bridge.dispatch(
      "event.emit",
      { name: "system:forbidden", payload: {} },
      { source: "module-a" }
    ),
  PermissionError
);

assertRejects(
  "bridge cache.set enforces permission",
  bridge.dispatch("cache.set", { key: "bridge-denied", value: "nope" }, { source: "module-a" }) as Promise<unknown>,
  PermissionError
);
pendingChecks.push(
  transport
    .request("cache.set", { key: "bridge-ok", value: "allowed" }, { source: "kernel" })
    .then(() => transport.request("cache.get", { key: "bridge-ok" }, { source: "kernel" }))
    .then((result) => {
      assertTrue(
        "transport cache.get returns value",
        (result as { value?: string }).value === "allowed"
      );
    })
);
assertRejects(
  "transport cache.set enforces permission",
  transport.request("cache.set", { key: "bridge-denied", value: "nope" }, { source: "module-a" }),
  PermissionError
);
assertRejects(
  "transport cache.set rejects non-serializable",
  transport.request(
    "cache.set",
    { key: "bridge-bad", value: { bad: () => undefined } },
    { source: "kernel" }
  ),
  CacheError
);

assertThrows(
  "bridge unknown command throws",
  () => bridge.dispatch("unknown.command" as KernelCommandName, {}, { source: "kernel" }),
  KernelBridgeError
);

const spamBus = new EventBus();
const spamPermissions = new PermissionSystem(spamBus);
spamBus.setPermissionChecker(spamPermissions);
const spamLoader = new ModuleLoader(spamBus, spamPermissions);
const spamModule = {
  name: "spam-module",
  start: (context: ModuleContext) => {
    for (let i = 0; i < 200; i += 1) {
      try {
        context.emit("system:forbidden", { index: i });
      } catch (error) {
        if (!(error instanceof PermissionError)) {
          throw error;
        }
      }
    }
  },
  stop: () => undefined,
};
spamLoader.register(spamModule);
let spamStormThrew = false;
try {
  spamLoader.start(spamModule.name);
} catch (error) {
  if (error instanceof EventContractError) {
    spamStormThrew = true;
  } else {
    throw error;
  }
}
assertTrue("permission spam does not crash kernel", spamStormThrew === false);
const spamDiagnostics = spamBus
  .history()
  .filter((entry) => entry.name === "diagnostic:permission_violation");
assertTrue(
  "permission spam diagnostics bounded",
  spamDiagnostics.length > 0 && spamDiagnostics.length <= 5,
  `Expected bounded permission diagnostics, got ${spamDiagnostics.length}.`
);

setTimeout(() => {
  const backpressureDiagnostics = backpressureBus
    .history()
    .filter((entry) => entry.name === "diagnostic:backpressure_overflow");
  assertTrue("backpressure overflow recorded", backpressureDiagnostics.length > 0);

  const batchedEvents = batchedBus
    .history()
    .filter((entry) => entry.name === "batch.event");
  assertTrue("batched events emit once", batchedEvents.length === 1);
  const batchPayload = batchedEvents[0]?.payload as unknown[];
  assertTrue(
    "batched payload is array",
    Array.isArray(batchPayload) && batchPayload.length === 200
  );

  const cacheStore = new CacheStore(permissionSystem);
  pendingChecks.push(
    cacheStore
      .set("selfcheck", { ok: true }, { source: "kernel" })
      .then(() => cacheStore.get("selfcheck", { source: "kernel" }))
      .then((value) => {
        assertTrue("cache store async get/set works", (value as { ok?: boolean })?.ok === true);
      })
      .catch((error) => {
        assertions.push({
          name: "cache store async get/set works",
          passed: false,
          message: String(error),
        });
      })
  );
  Promise.all(pendingChecks).then(() => finalize());
}, 20);

const finalize = () => {
  const failures = assertions.filter((assertion) => !assertion.passed);
  assertTrue("history not empty", eventBus.history().length > 0, "No events recorded.");

  if (failures.length > 0) {
    console.error("Kernel self-check failed:");
    for (const failure of failures) {
      console.error(`- ${failure.name}: ${failure.message ?? "failed"}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Kernel self-check passed.");
  }
};
