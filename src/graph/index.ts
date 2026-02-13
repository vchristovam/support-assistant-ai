import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseCheckpointSaver, MemorySaver } from "@langchain/langgraph";
import { RedisSaver } from "@langchain/langgraph-checkpoint-redis";
import { AzureChatOpenAI } from "@langchain/azure-openai";
import { createSupportSupervisor } from "../agents/supervisor/index.js";
import { config } from "../config/index.js";
import {
  SqlServerCheckpointSaver,
  type SqlServerConfig,
} from "../checkpointer/sqlserver.js";

const createLLM = (): BaseChatModel =>
  new AzureChatOpenAI({
    azureOpenAIApiKey: config.azureOpenAI.apiKey,
    azureOpenAIEndpoint: config.azureOpenAI.endpoint,
    azureOpenAIApiDeploymentName: config.azureOpenAI.deploymentName,
    azureOpenAIApiVersion: config.azureOpenAI.apiVersion,
  }) as unknown as BaseChatModel;

/**
 * Creates a Redis checkpointer for production state persistence.
 * @param url - Redis connection URL.
 * @returns Connected RedisSaver instance.
 */
export const createRedisCheckpointer = (url: string): Promise<RedisSaver> =>
  RedisSaver.fromUrl(url);

/**
 * Creates a SQL Server checkpointer for production state persistence.
 * @param sqlConfig - SQL Server connection configuration.
 * @returns Connected SqlServerCheckpointSaver instance.
 */
export const createSqlServerCheckpointer = async (
  sqlConfig: SqlServerConfig,
): Promise<SqlServerCheckpointSaver> => {
  return new SqlServerCheckpointSaver(sqlConfig);
};

/**
 * Builds the supergraph with an injectable checkpointer and optional LLM.
 * The default checkpointer is MemorySaver (synchronous, no Redis needed).
 * For production with Redis persistence, first await createRedisCheckpointer().
 *
 * @param checkpointer - State persistence backend (default: MemorySaver).
 * @param llm - Language model override; defaults to Azure OpenAI from config.
 * @returns Compiled supervisor graph orchestrating all agents (Databricks, Dynatrace, Filesystem, etc.).
 */
export const createGraph = (
  checkpointer: BaseCheckpointSaver = new MemorySaver(),
  llm?: BaseChatModel,
) => {
  const model = llm ?? createLLM();
  // createSupportSupervisor now returns a ReactAgent from createAgent
  // Access the underlying graph via .graph property
  const agent = createSupportSupervisor(model, checkpointer);
  const compiled = agent.graph;
  compiled.name = "Enterprise Support Autopilot";
  return compiled;
};
