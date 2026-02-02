import type { EventBus } from "./event-bus.ts";
import { SchemaContractError } from "./errors.ts";
import type { PermissionSystem } from "./permission-system.ts";

type SchemaDeclaration = {
  key: string;
  owner: string;
  description?: string;
};

type SchemaValidator = (payload: unknown) => { ok: boolean; error?: string };

export class SchemaRegistry {
  private declarations = new Map<string, SchemaDeclaration>();
  private validators = new Map<string, SchemaValidator>();
  private eventBus: EventBus;
  private permissionSystem: PermissionSystem;

  constructor(eventBus: EventBus, permissionSystem: PermissionSystem) {
    this.eventBus = eventBus;
    this.permissionSystem = permissionSystem;
  }

  registerDeclarations(
    moduleId: string,
    declarations: Array<{ key: string; description?: string }>
  ): void {
    for (const declaration of declarations) {
      if (!declaration?.key) {
        continue;
      }
      if (!this.declarations.has(declaration.key)) {
        this.declarations.set(declaration.key, {
          key: declaration.key,
          owner: moduleId,
          description: declaration.description,
        });
      }
    }
  }

  bindValidator(
    key: string,
    validator: SchemaValidator,
    meta: { source: string }
  ): void {
    if (!this.declarations.has(key)) {
      this.eventBus.emit(
        "diagnostic:schema_undeclared",
        { key, source: meta.source, timestamp: Date.now() },
        { source: "kernel" }
      );
      throw new SchemaContractError(`Schema key "${key}" was not declared.`);
    }
    if (meta.source !== "kernel") {
      this.permissionSystem.assert(meta.source, "schema.register", {
        action: "schema.register",
        target: key,
      });
    }
    this.validators.set(key, validator);
    this.eventBus.registerSchema(key, validator, { source: meta.source });
  }

  snapshot(): {
    keys: Array<{ key: string; owner: string; description?: string }>;
    boundValidators: number;
  } {
    return {
      keys: Array.from(this.declarations.values()),
      boundValidators: this.validators.size,
    };
  }
}
