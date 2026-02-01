# Developer Documentation — System Architecture

## Reality-First Policy
Documentation must reflect actual runtime behavior. If docs and runtime disagree, the runtime is wrong and must be corrected.

## Determinism
The runtime must be deterministic and free of nondeterministic inputs or AI-driven behavior.

## Separation of Concerns
- **Kernel**: Core runtime contracts and orchestration.
- **Modules**: Extension points that never modify kernel internals.
- **UI surfaces**: Pages/components that consume runtime outputs only.

## Status
This repository contains a scaffold only; no runtime behavior is implemented yet.
