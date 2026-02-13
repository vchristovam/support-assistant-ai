# AGENTS.md — Enterprise Support Autopilot

## Project Overview

LangGraph.js multi-agent system implementing the **Supervisor Pattern** for Tier-2 technical support automation. Built on Node.js 20+ / TypeScript / ESM. Currently being adapted from a LangGraph starter template per `ARCHITECTURE.md` — the target architecture includes Supervisor, Databricks, Dynatrace, Knowledge (Azure RAG), and Operations workers.

Read `ARCHITECTURE.md` before making structural changes. It is the source of truth for system design.

## Build / Lint / Test Commands

```bash
# Install dependencies
npm install

# Build (TypeScript compilation)
npm build                # tsc → dist/

# Lint
npm lint                 # eslint src/
npm format:check         # prettier --check .
npm lint:langgraph-json  # validates langgraph.json graph exports
npm lint:all             # all three above in parallel

# Format
npm format               # prettier --write .

# Test — unit (excludes *.int.test.ts)
npm test

# Test — single file
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern='tests/agent.test.ts'

# Test — single test by name
node --experimental-vm-modules node_modules/jest/bin/jest.js -t 'Test route'

# Test — integration (requires .env with API keys)
npm test:int

# Test — all (unit + integration + lint)
npm test:all
```

**Important**: Jest runs with `--experimental-vm-modules` for ESM support. Test timeout defaults to 20s. Integration tests may use 30s+.

## LangGraph Server

```bash
npx @langchain/langgraph-cli dev
```

Graph entry point is defined in `langgraph.json` → `./src/graph/index.ts:graph`. Any new graph must be registered there.

## Directory Structure

```
src/
  graph/
    index.ts          # Main graph assembly (nodes, edges, compile)
    state.ts          # StateAnnotation definition (shared state)
  config/             # Zod-validated env config
  agents/             # Supervisor + worker agents
    supervisor/       #   Routing brain
    databricks/       #   Data analytics worker
    dynatrace/        #   Observability worker
    knowledge/        #   Azure RAG worker
    operations/       #   HITL write operations
  server/             # Fastify/Express + SSE streaming
tests/
  *.test.ts           # Unit tests
  *.int.test.ts       # Integration tests (require live services)
scripts/
  checkLanggraphPaths.js  # Validates langgraph.json references
```

Each integration agent is **self-contained** in its own folder. Removing a feature = delete its folder + remove its registration from the graph and supervisor prompt. See `ARCHITECTURE.md` section 7.

## Code Style

### TypeScript / ESM

- **Module system**: ESM (`"type": "module"` in package.json)
- **Target**: ES2021, `"module": "NodeNext"`, `"moduleResolution": "nodenext"`
- **Strict mode**: Enabled (`strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`)
- **Output**: `dist/`

### Imports

- **Named imports only** — no default imports unless the library requires it
- **Order**: External packages first (`@langchain/...`), then local imports
- **ESM extensions required**: Local imports MUST use `.js` extension even in `.ts` files

```typescript
// Correct
import { StateGraph } from "@langchain/langgraph";
import { RunnableConfig } from "@langchain/core/runnables";
import { StateAnnotation } from "./state.js";

// Wrong — missing .js extension
import { StateAnnotation } from "./state";
```

### Exports

- **Named exports only** — no default exports
- Export the compiled graph, routing functions, and state annotations

```typescript
export const graph = builder.compile();
export const route = (state: typeof StateAnnotation.State) => { ... };
```

### Naming Conventions

| Element             | Convention      | Example                       |
| ------------------- | --------------- | ----------------------------- |
| Variables/functions | camelCase       | `callModel`, `builder`        |
| Annotations/Classes | PascalCase      | `StateAnnotation`             |
| Graph node names    | camelCase       | `"callModel"`, `"supervisor"` |
| Unused params       | `_` prefix      | `_config: RunnableConfig`     |
| Test files (unit)   | `*.test.ts`     | `agent.test.ts`               |
| Test files (integ.) | `*.int.test.ts` | `graph.int.test.ts`           |

### Functions

- **Arrow functions** for nodes, routers, and handlers
- **Async/await** for all graph nodes
- **Explicit return types** on node functions

```typescript
const callModel = async (
  state: typeof StateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof StateAnnotation.Update> => {
  // ...
};
```

### Types & State

- Define state via `Annotation.Root` in a dedicated `state.ts` — never raw interfaces
- Reference state types as `typeof StateAnnotation.State` (input) and `typeof StateAnnotation.Update` (return)
- Use `messagesStateReducer` for message history (append-only by default)

```typescript
export const StateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[], BaseMessageLike[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
});
```

### Documentation

- **JSDoc** on all exported functions and graph nodes
- Include `@param` and `@returns` tags
- Document routing logic and node behavior

### Error Handling

- Use standard `try/catch` with descriptive error messages
- Log errors with `console.error` and include context (`file`, `message`)
- Call `process.exit(1)` for fatal validation failures in scripts
- Never swallow errors with empty catch blocks

### Graph Construction Pattern

```typescript
const builder = new StateGraph(StateAnnotation)
  .addNode("callModel", callModel)
  .addEdge("__start__", "callModel")
  .addConditionalEdges("callModel", route);

export const graph = builder.compile();
graph.name = "Agent Name";
```

- Use `"__start__"` and `"__end__"` for entry/exit virtual nodes
- Chain `.addNode()` → `.addEdge()` → `.addConditionalEdges()` on the builder
- Always set `graph.name` after compile

### Testing

- Import test utilities from `@jest/globals` (not global jest)
- Import source modules with `.js` extension
- Use `describe`/`it`/`expect` pattern
- Set explicit timeouts for async tests: `it("name", async () => { ... }, 30_000)`

```typescript
import { describe, it, expect } from "@jest/globals";
import { route } from "../src/graph/index.js";

describe("Routers", () => {
  it("Test route", async () => {
    const res = route({ messages: [] });
    expect(res).toEqual("callModel");
  }, 100_000);
});
```

### Formatting

- **Prettier** handles all formatting — do not manually configure style
- Run `npm format` before committing
- Trailing commas in function parameters (Prettier default)
- Double quotes for strings
