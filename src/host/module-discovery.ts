import type { HostAdapter } from "./host-adapter.ts";

export type DiscoveredModule = {
  manifestPath: string;
  manifestJson?: unknown;
  error?: string;
};

export const discoverModules = async (
  host: HostAdapter,
  baseDir: string
): Promise<DiscoveredModule[]> => {
  const exists = await host.fs.exists(baseDir);
  if (!exists) {
    return [];
  }
  const entries = await host.fs.listDir(baseDir);
  const results: DiscoveredModule[] = [];

  for (const entry of entries) {
    const manifestPath = `${baseDir}/${entry}/manifest.json`;
    const hasManifest = await host.fs.exists(manifestPath);
    if (!hasManifest) {
      continue;
    }
    try {
      const contents = await host.fs.readTextFile(manifestPath);
      const parsed = JSON.parse(contents) as unknown;
      results.push({ manifestPath, manifestJson: parsed });
    } catch (error) {
      results.push({
        manifestPath,
        error: `JSON parse error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return results.sort((a, b) => a.manifestPath.localeCompare(b.manifestPath));
};
