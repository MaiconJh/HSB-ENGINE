import { KernelModule, ModuleContext } from "../kernel/module-loader";

export const dummyModule: KernelModule = {
  name: "dummy-module",
  start: (context: ModuleContext) => {
    console.log('[DummyModule] start');
    const unsubscribe = context.eventBus.listen("kernel.tick", (payload) => {
      console.log("[DummyModule] observed kernel.tick", payload);
    });

    context.eventBus.emit("dummy.started", { ok: true });
    (context as ModuleContext & { _dummyUnsubscribe?: () => void })._dummyUnsubscribe =
      unsubscribe;
  },
  stop: (context: ModuleContext) => {
    console.log('[DummyModule] stop');
    const unsubscribe = (context as ModuleContext & {
      _dummyUnsubscribe?: () => void;
    })._dummyUnsubscribe;
    if (!unsubscribe) {
      throw new Error("DummyModule.stop missing unsubscribe handler.");
    }
    unsubscribe();
    context.eventBus.emit("dummy.stopped", { ok: true });
  },
};
