import { StateGraph, CompiledStateGraph } from "@langchain/langgraph";

export const createSubgraph = <StateT>(
  name: string,
  stateAnnotation: any,
  buildFn: (builder: StateGraph<StateT>) => void,
): CompiledStateGraph<any, any, any> => {
  const builder = new StateGraph<StateT>(stateAnnotation);
  buildFn(builder);
  const compiled = builder.compile();
  compiled.name = name;
  return compiled as any;
};

export class SubgraphRegistry {
  private static instance: SubgraphRegistry;
  private subgraphs: Map<string, CompiledStateGraph<any, any, any>> = new Map();

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  public static getInstance(): SubgraphRegistry {
    if (!SubgraphRegistry.instance) {
      SubgraphRegistry.instance = new SubgraphRegistry();
    }
    return SubgraphRegistry.instance;
  }

  public register(
    name: string,
    subgraph: CompiledStateGraph<any, any, any>,
  ): void {
    this.subgraphs.set(name, subgraph);
  }

  public get(name: string): CompiledStateGraph<any, any, any> | undefined {
    return this.subgraphs.get(name);
  }

  public findByCriteria(
    criteria: (name: string) => boolean,
  ): CompiledStateGraph<any, any, any>[] {
    return Array.from(this.subgraphs.entries())
      .filter(([name]) => criteria(name))
      .map(([_, subgraph]) => subgraph);
  }

  public listNames(): string[] {
    return Array.from(this.subgraphs.keys());
  }
}
