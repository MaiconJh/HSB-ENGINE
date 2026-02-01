# Constraints

## Hard Technical Limits
- Kernel cannot access filesystem directly.
- Kernel cannot contain domain logic or UI logic.
- Modules cannot access each other directly.
- UI cannot own truth or bypass kernel contracts.

## Non-Goals
- Domain-specific applications.
- UI-first systems.
- Heuristic or speculative behavior.

## Forbidden Patterns
- Cross-layer shortcuts.
- Shared mutable state across modules.
- Undeclared behavior outside manifest contracts.
