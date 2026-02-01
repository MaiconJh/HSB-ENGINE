# Event System

## EventBus
The EventBus is owned by the kernel and is the single channel for runtime signals.

## Signals
Signals must be emitted for all internal processes. Silence is a defect.

## Observability
All events are traceable, pausable, and auditable.

## Safety Constraints
- Modules cannot spoof or suppress kernel signals.
- UI consumes signals as read-only snapshots.
