import type { EventBus } from "./event-bus.ts";
import { ManifestError } from "./errors.ts";
import type { KernelModule } from "./module-loader.ts";
import type { Permission } from "./permission-system.ts";

export type ModuleManifestSchema = {
  key: string;
  description?: string;
};

export type ModuleManifest = {
  id: string;
  version: string;
  permissions: Permission[];
  displayName?: string;
  description?: string;
  schemas?: ModuleManifestSchema[];
};

export type ModuleDefinition = {
  manifest: ModuleManifest;
  module: KernelModule;
};

const NAME_PATTERN = /^[a-z0-9_.:-]+$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const ALLOWED_PERMISSIONS: Permission[] = [
  "event.emit_reserved",
  "kernel.control",
  "storage.read",
  "storage.write",
  "telemetry.read",
  "schema.register",
  "backpressure.configure",
];

type ManifestErrorPayload = {
  moduleId: string;
  reason: string;
  field: string;
  timestamp: number;
};

const emitManifestInvalid = (
  eventBus: EventBus,
  payload: ManifestErrorPayload
): void => {
  eventBus.emit("diagnostic:manifest_invalid", payload, { source: "kernel" });
};

export const validateManifest = (manifest: ModuleManifest, eventBus: EventBus): void => {
  const moduleId = typeof manifest?.id === "string" ? manifest.id : "unknown";
  if (!manifest?.id) {
    emitManifestInvalid(eventBus, {
      moduleId,
      reason: "missing id",
      field: "id",
      timestamp: Date.now(),
    });
    throw new ManifestError("Manifest id is required.");
  }
  if (!NAME_PATTERN.test(manifest.id)) {
    emitManifestInvalid(eventBus, {
      moduleId: manifest.id,
      reason: "invalid id format",
      field: "id",
      timestamp: Date.now(),
    });
    throw new ManifestError(`Manifest id "${manifest.id}" is invalid.`);
  }
  if (!manifest.version) {
    emitManifestInvalid(eventBus, {
      moduleId: manifest.id,
      reason: "missing version",
      field: "version",
      timestamp: Date.now(),
    });
    throw new ManifestError("Manifest version is required.");
  }
  if (!VERSION_PATTERN.test(manifest.version)) {
    emitManifestInvalid(eventBus, {
      moduleId: manifest.id,
      reason: "invalid version format",
      field: "version",
      timestamp: Date.now(),
    });
    throw new ManifestError(`Manifest version "${manifest.version}" is invalid.`);
  }
  if (!Array.isArray(manifest.permissions)) {
    emitManifestInvalid(eventBus, {
      moduleId: manifest.id,
      reason: "permissions must be an array",
      field: "permissions",
      timestamp: Date.now(),
    });
    throw new ManifestError("Manifest permissions must be an array.");
  }
  for (const perm of manifest.permissions) {
    if (!ALLOWED_PERMISSIONS.includes(perm)) {
      emitManifestInvalid(eventBus, {
        moduleId: manifest.id,
        reason: "invalid permission",
        field: "permissions",
        timestamp: Date.now(),
      });
      throw new ManifestError(`Manifest permission "${perm}" is invalid.`);
    }
  }
  if (manifest.schemas !== undefined) {
    if (!Array.isArray(manifest.schemas)) {
      emitManifestInvalid(eventBus, {
        moduleId: manifest.id,
        reason: "schemas must be an array",
        field: "schemas",
        timestamp: Date.now(),
      });
      throw new ManifestError("Manifest schemas must be an array.");
    }
    for (const schema of manifest.schemas) {
      if (!schema?.key || !NAME_PATTERN.test(schema.key)) {
        emitManifestInvalid(eventBus, {
          moduleId: manifest.id,
          reason: "invalid schema key",
          field: "schemas",
          timestamp: Date.now(),
        });
        throw new ManifestError(`Manifest schema key "${schema?.key ?? ""}" is invalid.`);
      }
    }
  }
};

