import type { KernelTransport } from "../kernel/kernel-transport.ts";
import { UnifiedKernelTransport } from "../kernel/unified-transport.ts";
import { TauriKernelTransport } from "../kernel/tauri-transport.ts";

type GlobalTransport = {
  request: (cmd: string, payload: unknown, meta: { source: string }) => Promise<unknown>;
};

const isTauri = (): boolean =>
  typeof (globalThis as { __TAURI__?: unknown }).__TAURI__ !== "undefined";

class BrowserLocalTransport implements KernelTransport {
  request(cmd: string, payload: unknown, meta: { source: string }): Promise<unknown> {
    const globalTransport = (globalThis as { __KERNEL_TRANSPORT__?: GlobalTransport })
      .__KERNEL_TRANSPORT__;
    if (!globalTransport) {
      return Promise.resolve({
        ok: false,
        error: { code: "HOST_UNAVAILABLE", message: "Local transport unavailable." },
      });
    }
    return globalTransport.request(cmd, payload, meta);
  }
}

export const createUiTransport = (): UnifiedKernelTransport => {
  const local = new BrowserLocalTransport();
  const tauri = isTauri() ? new TauriKernelTransport() : undefined;
  return new UnifiedKernelTransport({ local, tauri, mode: "auto" });
};
