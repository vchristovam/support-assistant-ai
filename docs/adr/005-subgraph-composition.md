# 5. Subgraph Composition for Complex Agents

## Status
Accepted

## Context
As agents become more complex, their internal logic becomes harder to manage within a single flat graph. Agents often need their own private state and internal flows that shouldn't be exposed to the parent graph.

## Decision
We will use compiled subgraphs to encapsulate complex agent logic. These subgraphs will be treated as single nodes within the main graph.

## Consequences
- **Encapsulation**: Internal logic and state of an agent are hidden from the rest of the system, reducing cognitive load.
- **Reusable components**: Subgraphs can be easily shared and reused across different parts of the application or even in different projects.
- **Improved maintainability**: Smaller, focused graphs are easier to test, debug, and modify than one large, monolithic graph.
