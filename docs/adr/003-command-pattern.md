# 3. Command Pattern for Routing

## Status
Accepted

## Context
Implicit routing based on conditional logic within nodes made it difficult to visualize and debug the control flow of the application. It also led to tightly coupled components.

## Decision
We will adopt the Command pattern for routing. Each action will return a command that dictates the next step in the process, rather than having nodes decide their successors directly.

## Consequences
- **Explicit routing**: The flow of execution becomes much easier to follow and reason about.
- **Type safety**: Commands can be typed, ensuring that only valid transitions are possible.
- **Decoupling**: Nodes focus on their specific tasks and communicate their results via commands, leading to better separation of concerns.
