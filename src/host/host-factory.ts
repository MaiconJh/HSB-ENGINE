import type { HostAdapter } from "./host-adapter.ts";
import { NodeHost } from "./node-host.ts";

export const createHost = async (kind: "node" | "tauri"): Promise<HostAdapter> => {
  if (kind === "tauri") {
    const mod = await import("./tauri-host.ts");
    return new mod.TauriHost();
  }
  return new NodeHost();
};
