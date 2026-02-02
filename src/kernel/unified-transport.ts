import type { KernelCommandMeta } from "./kernel-bridge.ts";
import type { KernelTransport } from "./kernel-transport.ts";

export type KernelRequestEnvelope = {
  id: string;
  cmd: string;
  payload: unknown;
  meta: { source: string };
};

type ErrorResponse = { ok: false; error: { code: string; message: string } };

export class UnifiedKernelTransport implements KernelTransport {
  private local: KernelTransport;
  private tauri?: KernelTransport;
  private mode: "node" | "tauri" | "auto";

  constructor(options: {
    local: KernelTransport;
    tauri?: KernelTransport;
    mode: "node" | "tauri" | "auto";
  }) {
    this.local = options.local;
    this.tauri = options.tauri;
    this.mode = options.mode;
  }

  request(cmd: string, payload: unknown, meta: KernelCommandMeta): Promise<unknown> {
    if (!cmd || typeof cmd !== "string") {
      return Promise.resolve(this.error("INVALID_ENVELOPE", "Command must be a string."));
    }
    if (!meta || typeof meta.source !== "string" || meta.source.length === 0) {
      return Promise.resolve(this.error("INVALID_ENVELOPE", "Missing meta.source."));
    }
    const prefix = cmd.split(".")[0] ?? "";
    if (!prefix) {
      return Promise.resolve(this.error("UNKNOWN_COMMAND_PREFIX", "Missing command prefix."));
    }
    if (prefix === "host") {
      return this.routeHost(cmd, payload, meta);
    }
    if (["kernel", "event", "module", "cache", "schema"].includes(prefix)) {
      return this.local.request(cmd, payload, meta);
    }
    return Promise.resolve(this.error("UNKNOWN_COMMAND_PREFIX", `Unknown prefix "${prefix}".`));
  }

  private routeHost(cmd: string, payload: unknown, meta: KernelCommandMeta): Promise<unknown> {
    if (this.mode === "tauri") {
      if (!this.tauri) {
        return Promise.resolve(this.error("HOST_UNAVAILABLE", "Tauri transport unavailable."));
      }
      return this.tauri.request(cmd, payload, meta);
    }
    if (this.mode === "node") {
      if (cmd === "host.modules.scan") {
        return this.local.request(cmd, payload, meta);
      }
      return Promise.resolve(this.error("HOST_UNAVAILABLE", "Host commands unavailable."));
    }
    if (this.isTauriEnv() && this.tauri) {
      return this.tauri.request(cmd, payload, meta);
    }
    if (cmd === "host.modules.scan") {
      return this.local.request(cmd, payload, meta);
    }
    return Promise.resolve(this.error("HOST_UNAVAILABLE", "Host commands unavailable."));
  }

  private isTauriEnv(): boolean {
    const globalObj = globalThis as { __TAURI__?: unknown } | undefined;
    return Boolean(globalObj && "__TAURI__" in globalObj);
  }

  private error(code: string, message: string): ErrorResponse {
    return { ok: false, error: { code, message } };
  }
}
