# Data Ingestion

## External Data Policy
All external data enters the system through modules. The kernel remains domain-blind.

## Ingestion Rules
- Ingestion must be declared in module manifests.
- Data handling must conform to schema-defined contracts.
- Unauthorized data sources are invalid.

## Scheduling
Ingestion scheduling is a module responsibility and must be observable through kernel signals.

## Validation
All ingested data must be validated against schemas before it influences runtime behavior.
