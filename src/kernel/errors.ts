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
