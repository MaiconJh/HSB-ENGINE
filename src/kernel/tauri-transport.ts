import type { KernelCommandMeta, KernelCommandName } from "./kernel-bridge.ts";
import { KernelBridgeError } from "./errors.ts";

export type IpcRequest = {
  id: string;
  cmd: string;
  payload: unknown;
  meta: { source: string };
};

export type IpcResponse = {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
};

export class TauriKernelTransport {
  private invokeCommand: string;

  constructor(options?: { invokeCommand?: string }) {
    this.invokeCommand = options?.invokeCommand ?? "hsb_ipc";
  }

  async request(
    cmd: KernelCommandName,
    payload: unknown,
    meta: KernelCommandMeta
  ): Promise<unknown> {
    const { invoke } = await import("@tauri-apps/api/tauri");
    const request: IpcRequest = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      cmd,
      payload,
      meta,
    };
    const response = await invoke<IpcResponse>(this.invokeCommand, { request });
    this.assertResponse(response, request.id);
    if (!response.ok) {
      const message = response.error?.message ?? "Unknown IPC error";
      const code = response.error?.code ?? "IPC_ERROR";
      throw new KernelBridgeError(`${code}: ${message}`);
    }
    return response.data ?? null;
  }

  private assertResponse(response: IpcResponse, id: string): void {
    if (!response || typeof response !== "object") {
      throw new KernelBridgeError("IPC response is not an object.");
    }
    if (response.id !== id) {
      throw new KernelBridgeError("IPC response id mismatch.");
    }
    if (typeof response.ok !== "boolean") {
      throw new KernelBridgeError("IPC response missing ok flag.");
    }
    if (!response.ok && !response.error) {
      throw new KernelBridgeError("IPC response missing error details.");
    }
  }
}
