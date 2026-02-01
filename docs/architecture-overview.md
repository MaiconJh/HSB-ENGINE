# Architecture Overview

## Identity
The HSB Engine is a Deterministic Modular Execution Platform.

## Canonical Layer Model
The system is divided into four immutable layers:

```
┌────────────────────────────┐
│        Interface Layer      │
├────────────────────────────┤
│    Module Execution Layer   │
├────────────────────────────┤
│   Kernel / Runtime Layer    │
├────────────────────────────┤
│      Host / Platform        │
└────────────────────────────┘
```

## Layer Responsibilities
- **Host / Platform**: Filesystem access, process management, secure persistence, native telemetry, plugin discovery, sandbox enforcement.
- **Kernel / Runtime**: ModuleLoader, EventBus, TelemetryCore, WatchdogCore, Permission System, CacheStore.
- **Module Execution**: Isolated modules that implement capabilities.
- **Interface**: Reactive UI stations that observe state and send commands.

## Data Flow
- Host provides platform capabilities to the kernel.
- Kernel orchestrates modules and emits state.
- Modules emit signals and outputs through kernel contracts.
- Interface observes snapshots and issues commands; it never owns truth.
