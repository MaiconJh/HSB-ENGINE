export class KernelInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KernelInvariantError";
  }
}

export class ModuleLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModuleLifecycleError";
  }
}

export class EventContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventContractError";
  }
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}

export class SchemaContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaContractError";
  }
}

export class KernelBridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KernelBridgeError";
  }
}
