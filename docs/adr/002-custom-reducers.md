# 2. Custom Reducers for State Management

## Status

Accepted

## Context

Standard state merging often falls short when dealing with complex data structures in agentic workflows. Simple appending or overwriting is not always sufficient for managing state across multiple steps.

## Decision

We will implement and use custom reducers such as `override` (to replace existing values) and `uniqueAppend` (to add items to a list only if they are not already present).

## Consequences

- **Explicit control**: Developers have precise control over how state updates are applied.
- **Data integrity**: Prevents duplicate entries and accidental data loss during state merging.
- **Predictability**: Makes the state transitions more transparent and easier to trace.
