# HSB-ENGINE

Deterministic, modular engine scaffold focused on reality-first documentation and clear separation between core runtime, modules, and UI surfaces.

## Principles
- **Reality-first docs**: If documentation and runtime disagree, the runtime is wrong and must be corrected.
- **Deterministic execution**: No nondeterminism in runtime flows.
- **No AI in runtime**: Intelligence tools live outside the core runtime.
- **No mock data**: Documentation and tests reflect real behavior.
- **Modular extensibility**: Extend via modules without modifying core.
- **UI separation**: UI surfaces do not leak into kernel concerns.

## Repository Map
- `src/kernel/`: Core runtime boundaries and contracts.
- `src/modules/`: Pluggable modules that extend behavior.
- `src/pages/`: UI page-level surfaces.
- `src/components/`: Reusable UI primitives.
- `src/styles/`: Style foundations.
- `src/types/`: Shared type definitions.
- `docs/`: Architecture, decisions, and developer documentation.
- `scripts/`: Audits and developer utilities.

## Status
Scaffold only. No runtime logic has been implemented yet.
