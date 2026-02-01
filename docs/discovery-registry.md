# Discovery and Registry

## Current Discovery Mechanism
Discovery is owned by the host/platform layer. In the browser-kernel phase, discovery is limited by host capabilities and does not include filesystem-based plugin discovery.

## Registry Integrity Rules
- Discovery must enforce module isolation and permission boundaries.
- Registry entries must be auditable and deterministic.

## Web Limitations
Browser hosts restrict native filesystem access and plugin isolation, limiting discovery to what the host can expose.
