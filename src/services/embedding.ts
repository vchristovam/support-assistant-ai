import { AzureOpenAIEmbeddings } from "@langchain/azure-openai";
import { config } from "../config/index.js";

export const getEmbeddingClient = (): AzureOpenAIEmbeddings => {
  const { apiKey, endpoint, embeddingDeploymentName } = config.azureOpenAI;

  if (!apiKey || !endpoint || !embeddingDeploymentName) {
    throw new Error(
      "Missing Azure OpenAI configuration: API key, endpoint, and embedding deployment name are required.",
    );
  }

  return new AzureOpenAIEmbeddings({
    azureOpenAIApiKey: apiKey,
    azureOpenAIApiDeploymentName: embeddingDeploymentName,
    azureOpenAIApiVersion: config.azureOpenAI.apiVersion,
    azureOpenAIEndpoint: endpoint,
  });
};

export const embedText = async (text: string): Promise<number[]> => {
  const client = getEmbeddingClient();
  return client.embedQuery(text);
};

export const embedDocuments = async (texts: string[]): Promise<number[][]> => {
  const client = getEmbeddingClient();
  return client.embedDocuments(texts);
};
