# Architecture Overview

## Intent
Provide a deterministic, modular runtime with clear boundaries between kernel, modules, and UI surfaces.

## Boundaries
- **Kernel**: Runtime contracts and orchestration.
- **Modules**: Feature extensions that plug in without core edits.
- **UI**: Presentation only; no kernel decisions.

## Reality-First
If runtime and documentation diverge, runtime is considered wrong and must be corrected.
