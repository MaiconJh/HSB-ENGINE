# Contributing

Thanks for improving the engine scaffold.

## Ground Rules
- Keep documentation reality-first: if behavior changes, update docs first.
- Preserve deterministic execution and avoid AI in runtime paths.
- Do not add mock data to examples or templates.
- Prefer modules for extension rather than core edits.

## Change Workflow
1. Open or update an architecture/decision doc if behavior changes.
2. Keep changes modular and scoped.
3. Update the PR checklist items as you complete them.

## Directory Intent
- `src/kernel/`: Runtime contracts and core logic boundary (no UI).
- `src/modules/`: Extension points and feature modules.
- `src/pages/` + `src/components/`: UI surfaces and components.
- `docs/`: Architecture, system documentation, decisions.
