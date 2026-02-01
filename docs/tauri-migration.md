# Tauri Migration

## Why Migration Is Required
The host/platform layer owns filesystem access, process management, secure persistence, native telemetry, plugin discovery, and sandbox enforcement. A dedicated host is required to provide these capabilities reliably.

## What Moves to the Host
- Kernel runtime execution
- Filesystem access and secure persistence
- Process management and plugin isolation
- Native telemetry

## What Stays in the UI
- Reactive interface stations
- Snapshot rendering
- Command dispatch

## Goals of Migration
- Enforce host-layer responsibilities outside the browser sandbox.
- Preserve kernel immutability and module isolation.
- Support platform mode expansion with real plugin isolation.
