import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterAll,
} from "@jest/globals";
import { resetEnv } from "../../src/config/env.js";

const mockGetIndex = jest.fn<any>();
const mockCreateIndex = jest.fn<any>();
const mockUploadDocuments = jest.fn<any>();

jest.unstable_mockModule("@azure/search-documents", () => {
  return {
    SearchIndexClient: jest.fn().mockImplementation(() => {
      return {
        getIndex: mockGetIndex,
        createIndex: mockCreateIndex,
      };
    }),
    SearchClient: jest.fn().mockImplementation(() => {
      return {
        uploadDocuments: mockUploadDocuments,
      };
    }),
    AzureKeyCredential: jest.fn().mockImplementation((key) => ({ key })),
  };
});

jest.unstable_mockModule("../../src/services/embedding.js", () => {
  return {
    embedText: jest.fn<any>().mockResolvedValue([0.1, 0.2, 0.3]),
  };
});

const { ensureIndex, indexDocument } =
  await import("../../src/services/azureSearch.js");

describe("Azure Search Service", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    resetEnv();
    process.env.AZURE_SEARCH_ENDPOINT =
      "https://test-search.search.windows.net";
    process.env.AZURE_SEARCH_KEY = "test-key";
    process.env.AZURE_SEARCH_INDEX = "test-index";
    process.env.AZURE_OPENAI_API_KEY = "test-openai-key";
    process.env.AZURE_OPENAI_API_ENDPOINT =
      "https://test-openai.openai.azure.com";
    process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME = "test-embedding";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("ensureIndex", () => {
    it("should not create index if it already exists", async () => {
      mockGetIndex.mockResolvedValueOnce({ name: "test-index" });

      await ensureIndex();

      expect(mockGetIndex).toHaveBeenCalledWith("test-index");
      expect(mockCreateIndex).not.toHaveBeenCalled();
    });

    it("should create index if it does not exist (404)", async () => {
      mockGetIndex.mockRejectedValueOnce({ statusCode: 404 });
      mockCreateIndex.mockResolvedValueOnce({});

      await ensureIndex();

      expect(mockGetIndex).toHaveBeenCalledWith("test-index");
      expect(mockCreateIndex).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "test-index",
          fields: expect.arrayContaining([
            expect.objectContaining({ name: "id" }),
            expect.objectContaining({ name: "content_vector" }),
          ]),
        }),
      );
    });

    it("should throw error if getIndex fails with non-404", async () => {
      mockGetIndex.mockRejectedValueOnce({ statusCode: 500 });

      await expect(ensureIndex()).rejects.toMatchObject({ statusCode: 500 });
    });
  });

  describe("indexDocument", () => {
    it("should embed text and upload document", async () => {
      mockUploadDocuments.mockResolvedValueOnce({});

      await indexDocument("test content", {
        source: "test-source",
        tags: ["tag1"],
        id: "test-id",
      });

      expect(mockUploadDocuments).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "test-id",
          content: "test content",
          content_vector: [0.1, 0.2, 0.3],
          source: "test-source",
          tags: ["tag1"],
          created_at: expect.any(Date),
        }),
      ]);
    });

    it("should generate a UUID if id is not provided", async () => {
      mockUploadDocuments.mockResolvedValueOnce({});

      await indexDocument("test content", {
        source: "test-source",
      });

      expect(mockUploadDocuments).toHaveBeenCalledWith([
        expect.objectContaining({
          id: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          ),
          content: "test content",
        }),
      ]);
    });
  });
});
