import type { KernelModule, ModuleContext } from "../kernel/module-loader.ts";
import { KernelInvariantError } from "../kernel/errors.ts";
import { logger } from "../kernel/logger.ts";

type DummyState = {
  unsubscribe?: () => void;
};

const state = new Map<string, DummyState>();

export const dummyModule: KernelModule = {
  name: "dummy-module",
  start: (context: ModuleContext) => {
    logger.info("Dummy module start", { module: context.moduleName });
    const unsubscribe = context.listen("kernel.tick", (payload) => {
      logger.info("Dummy module observed kernel.tick", {
        module: context.moduleName,
        payload,
      });
    });

    context.emit("dummy.started", { ok: true });
    state.set(context.moduleName, { unsubscribe });
  },
  stop: (context: ModuleContext) => {
    logger.info("Dummy module stop", { module: context.moduleName });
    const existing = state.get(context.moduleName);
    if (!existing?.unsubscribe) {
      throw new KernelInvariantError("DummyModule.stop missing unsubscribe handler.");
    }
    existing.unsubscribe();
    context.emit("dummy.stopped", { ok: true });
    state.delete(context.moduleName);
  },
};
