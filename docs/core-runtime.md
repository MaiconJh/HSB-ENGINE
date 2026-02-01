# Core Runtime

## Kernel Scope
The kernel is immutable and domain-blind. It contains runtime orchestration only.

## Owned Components
- ModuleLoader
- EventBus
- TelemetryCore
- WatchdogCore
- Permission System
- CacheStore

## Lifecycle
- Load modules via the ModuleLoader.
- Enforce permissions and isolation.
- Emit signals through the EventBus.
- Maintain auditable runtime state.

## Isolation Guarantees
- No domain logic in the kernel.
- No UI logic in the kernel.
- No data semantics in the kernel.
- No direct filesystem access in the kernel.
