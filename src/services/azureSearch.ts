import {
  SearchClient,
  SearchIndexClient,
  AzureKeyCredential,
} from "@azure/search-documents";
import { config } from "../config/index.js";
import { embedText } from "./embedding.js";
import { v4 as uuidv4 } from "uuid";

export interface KnowledgeDocument {
  id: string;
  content: string;
  content_vector: number[];
  source: string;
  tags: string[];
  created_at: Date;
}

const getSearchConfig = () => {
  const { endpoint, key, index } = config.knowledge;

  if (!endpoint || !key || !index) {
    throw new Error(
      "Missing Azure Search configuration: endpoint, key, and index name are required.",
    );
  }

  return { endpoint, key, index };
};

export const getSearchIndexClient = (): SearchIndexClient => {
  const { endpoint, key } = getSearchConfig();
  return new SearchIndexClient(endpoint, new AzureKeyCredential(key));
};

export const getSearchClient = (): SearchClient<KnowledgeDocument> => {
  const { endpoint, key, index } = getSearchConfig();
  return new SearchClient<KnowledgeDocument>(
    endpoint,
    index,
    new AzureKeyCredential(key),
  );
};

export const ensureIndex = async (): Promise<void> => {
  const { index: indexName } = getSearchConfig();
  const indexClient = getSearchIndexClient();

  try {
    const existingIndex = await indexClient.getIndex(indexName);
    if (existingIndex) {
      return;
    }
  } catch (error: any) {
    if (error.statusCode !== 404) {
      throw error;
    }
  }

  await indexClient.createIndex({
    name: indexName,
    fields: [
      {
        name: "id",
        type: "Edm.String",
        key: true,
        filterable: true,
      },
      {
        name: "content",
        type: "Edm.String",
        searchable: true,
      },
      {
        name: "content_vector",
        type: "Collection(Edm.Single)",
        searchable: true,
        vectorSearchDimensions: 1536,
        vectorSearchProfileName: "my-vector-profile",
      },
      {
        name: "source",
        type: "Edm.String",
        filterable: true,
        searchable: true,
      },
      {
        name: "tags",
        type: "Collection(Edm.String)",
        filterable: true,
        searchable: true,
      },
      {
        name: "created_at",
        type: "Edm.DateTimeOffset",
        filterable: true,
        sortable: true,
      },
    ],
    vectorSearch: {
      algorithms: [
        {
          name: "my-hnsw-config",
          kind: "hnsw",
        },
      ],
      profiles: [
        {
          name: "my-vector-profile",
          algorithmConfigurationName: "my-hnsw-config",
        },
      ],
    },
  });
};

export const indexDocument = async (
  content: string,
  metadata: {
    source: string;
    tags?: string[];
    id?: string;
  },
): Promise<void> => {
  const searchClient = getSearchClient();
  const vector = await embedText(content);

  const document: KnowledgeDocument = {
    id: metadata.id || uuidv4(),
    content,
    content_vector: vector,
    source: metadata.source,
    tags: metadata.tags || [],
    created_at: new Date(),
  };

  await searchClient.uploadDocuments([document]);
};
