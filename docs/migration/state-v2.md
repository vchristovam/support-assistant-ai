# Migrating to State V2

This guide outlines the changes required to migrate your team state management to V2.

## Overview

State V2 introduces `TeamStateAnnotation`, custom reducers for better state merging, and built-in iteration tracking to prevent infinite loops and manage complex multi-agent workflows.

## Key Changes

### 1. TeamStateAnnotation

The new `TeamStateAnnotation` provides a type-safe way to define your state with built-in support for common fields.

### 2. Custom Reducers

Instead of simple overwrites, V2 supports custom reducers (using `Annotated`) to define how specific fields should be updated (e.g., appending to lists instead of replacing them).

### 3. Iteration Tracking

New fields like `iterations`, `max_iterations`, and `current_step` are now standard to help manage control flow.

## Examples

### Before (V1)

```python
class TeamState(TypedDict):
    messages: List[BaseMessage]
    next_agent: str
    task_completed: bool
```

### After (V2)

```python
from typing import Annotated, Sequence, TypedDict
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

class TeamStateAnnotation(TypedDict):
    # Use Annotated with add_messages for proper message merging
    messages: Annotated[Sequence[BaseMessage], add_messages]
    
    # Built-in iteration tracking
    iterations: int
    max_iterations: int
    
    # Custom fields with specific reducers
    next_agent: str
    task_completed: bool
    
    # New V2 specific metadata
    metadata: dict
```

## Migration Steps

1. Update your state definitions to use `TypedDict` and `Annotated` where appropriate.
2. Initialize `iterations` and `max_iterations` in your graph entry point.
3. Update nodes to increment `iterations` and check against `max_iterations`.
