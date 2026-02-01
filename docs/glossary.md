# Glossary

## CacheStore
Kernel-owned cache system that stores runtime data without domain semantics.

## EventBus
Kernel-owned signal channel used for all runtime events.

## Host / Platform
Layer that owns filesystem access, process management, secure persistence, native telemetry, plugin discovery, and sandbox enforcement.

## Interface Layer
Reactive layer that observes state, renders snapshots, and sends commands.

## Kernel / Runtime
Immutable orchestration layer that manages modules and runtime contracts.

## Manifest
Contract that defines allowed module behavior and permissions.

## Module
Isolated system unit that declares inputs, outputs, permissions, processes, UI exposure, and persistence needs.

## ModuleLoader
Kernel component that loads and isolates modules.

## Permission System
Kernel-owned enforcement of module permissions and access boundaries.

## Schema
Definition that constrains data, execution, and UI derivation.

## Signal
Observable event emitted by the kernel for auditability.

## Station
Interface surface that answers operational questions about state, faults, actions, and inspection.

## TelemetryCore
Kernel component that collects runtime signals for auditing and traceability.

## WatchdogCore
Kernel component that monitors runtime stability and enforces isolation.

## Micro-node
Reserved term with no defined meaning in the current architecture constitution.
