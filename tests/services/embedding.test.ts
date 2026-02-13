import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterAll,
} from "@jest/globals";
import { resetEnv } from "../../src/config/env.js";

jest.unstable_mockModule("@langchain/azure-openai", () => {
  return {
    AzureOpenAIEmbeddings: jest.fn().mockImplementation(() => {
      return {
        embedQuery: jest.fn<any>().mockResolvedValue([0.1, 0.2, 0.3]),
        embedDocuments: jest.fn<any>().mockResolvedValue([
          [0.1, 0.2, 0.3],
          [0.4, 0.5, 0.6],
        ]),
      };
    }),
  };
});

const { embedText, embedDocuments, getEmbeddingClient } =
  await import("../../src/services/embedding.js");

describe("Embedding Service", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    resetEnv();
    process.env.AZURE_OPENAI_API_KEY = "test-key";
    process.env.AZURE_OPENAI_API_ENDPOINT =
      "https://test-endpoint.openai.azure.com";
    process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME =
      "test-embedding-deployment";
    process.env.AZURE_OPENAI_API_VERSION = "2024-06-01";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("getEmbeddingClient", () => {
    it("should return an instance of AzureOpenAIEmbeddings", () => {
      const client = getEmbeddingClient();
      expect(client).toBeDefined();
    });

    it("should throw an error if configuration is missing", () => {
      delete process.env.AZURE_OPENAI_API_KEY;
      resetEnv();

      expect(() => getEmbeddingClient()).toThrow(
        "Missing Azure OpenAI configuration",
      );
    });
  });

  describe("embedText", () => {
    it("should return an embedding for a string", async () => {
      const embedding = await embedText("hello world");
      expect(embedding).toEqual([0.1, 0.2, 0.3]);
    });
  });

  describe("embedDocuments", () => {
    it("should return embeddings for multiple strings", async () => {
      const embeddings = await embedDocuments(["hello", "world"]);
      expect(embeddings).toEqual([
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ]);
    });
  });
});
