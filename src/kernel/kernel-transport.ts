import type { KernelCommandMeta, KernelCommandName, KernelBridge } from "./kernel-bridge.ts";

export type KernelTransport = {
  request(name: KernelCommandName, payload: unknown, meta: KernelCommandMeta): Promise<unknown>;
};

export class LocalKernelTransport implements KernelTransport {
  private bridge: KernelBridge;

  constructor(bridge: KernelBridge) {
    this.bridge = bridge;
  }

  request(name: KernelCommandName, payload: unknown, meta: KernelCommandMeta): Promise<unknown> {
    return Promise.resolve(this.bridge.dispatch(name, payload, meta));
  }
}
