import { EventBus } from "../src/kernel/event-bus.ts";
import { ModuleLoader } from "../src/kernel/module-loader.ts";
import { dummyModule } from "../src/modules/dummy-module.ts";
import {
  EventContractError,
  ModuleLifecycleError,
} from "../src/kernel/errors.ts";

type Assertion = {
  name: string;
  passed: boolean;
  message?: string;
};

const assertions: Assertion[] = [];

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

const eventBus = new EventBus();
const moduleLoader = new ModuleLoader(eventBus);

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
