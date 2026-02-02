import type { KernelCommandMeta, KernelCommandName, KernelBridge } from "./kernel-bridge.ts";

export type KernelTransport = {
  request(name: string, payload: unknown, meta: KernelCommandMeta): Promise<unknown>;
};

export class LocalKernelTransport implements KernelTransport {
  private bridge: KernelBridge;

  constructor(bridge: KernelBridge) {
    this.bridge = bridge;
  }

  request(name: string, payload: unknown, meta: KernelCommandMeta): Promise<unknown> {
    return Promise.resolve(this.bridge.dispatch(name as KernelCommandName, payload, meta));
  }
}
