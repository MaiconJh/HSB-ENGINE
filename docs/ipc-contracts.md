# IPC Contracts

## Required IPC Messages
- UI-to-kernel command messages
- Kernel-to-UI state snapshots
- Kernel-to-host capability requests
- Host-to-kernel platform responses

## Directionality
IPC is directional and contract-defined. The UI does not bypass the kernel to reach host services.

## Backpressure Rules
IPC must enforce backpressure to maintain deterministic execution and prevent unbounded queues.
