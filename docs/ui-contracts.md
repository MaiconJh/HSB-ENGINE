# UI Contracts

## Consumer-Only UI
The interface layer observes state and sends commands. It never owns truth.

## No Direct Data Access
UI surfaces do not access host/platform resources or kernel internals directly.

## Reactive Snapshots
UI is driven by kernel snapshots and module outputs through defined contracts.

## Station Requirement
Each interface is a station that answers:
- What is happening now?
- What is wrong?
- What can I do?
- What can I inspect?
