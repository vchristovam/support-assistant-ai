import { z } from "zod";
import { loadEnv } from "./env.js";

export interface UIConfig<T> {
  type: "text" | "number" | "boolean" | "slider" | "select";
  default: T;
  description: string;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: T }>;
}

export const createConfigField = <T>(
  schema: z.ZodType<T>,
  uiConfig: UIConfig<T>,
): z.ZodDefault<z.ZodType<T>> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return schema.default(uiConfig.default as unknown as any).describe(JSON.stringify(uiConfig));
};

export const azureApiKey = createConfigField(z.string(), {
  type: "text",
  default: "",
  description: "Azure OpenAI API Key for authentication",
});

export const azureEndpoint = createConfigField(z.string(), {
  type: "text",
  default: "",
  description: "Azure OpenAI endpoint URL",
});

export const azureDeploymentName = createConfigField(z.string(), {
  type: "text",
  default: "",
  description: "Azure OpenAI deployment name",
});

export const azureApiVersion = createConfigField(z.string(), {
  type: "text",
  default: "2024-02-01",
  description: "Azure OpenAI API version",
});

export const databaseConnectionString = createConfigField(z.string(), {
  type: "text",
  default: "",
  description: "Database connection string",
});

export const maxIterations = createConfigField(z.number(), {
  type: "slider",
  default: 10,
  min: 1,
  max: 50,
  step: 1,
  description: "Maximum number of graph iterations",
});

export const maxConcurrentWorkers = createConfigField(z.number(), {
  type: "slider",
  default: 5,
  min: 1,
  max: 20,
  step: 1,
  description: "Maximum number of workers to run in parallel",
});

export const config = {
  get app() {
    const env = loadEnv();
    return {
      env: env.NODE_ENV,
      port: env.PORT,
      isDev: env.NODE_ENV === "development",
    };
  },
  get azureOpenAI() {
    const env = loadEnv();
    return {
      apiKey: env.AZURE_OPENAI_API_KEY,
      endpoint: env.AZURE_OPENAI_API_ENDPOINT,
      deploymentName: env.AZURE_OPENAI_DEPLOYMENT_NAME,
      embeddingDeploymentName: env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME,
      apiVersion: env.AZURE_OPENAI_API_VERSION,
    };
  },
  get databricks() {
    const env = loadEnv();
    return {
      host: env.DATABRICKS_HOST,
      token: env.DATABRICKS_TOKEN,
      sqlWarehouseId: env.DATABRICKS_SQL_WAREHOUSE_ID,
      genieSpaceId: env.DATABRICKS_GENIE_SPACE_ID,
    };
  },
  get dynatrace() {
    const env = loadEnv();
    return {
      url: env.DYNATRACE_URL,
      token: env.DYNATRACE_API_TOKEN,
      enabled: !!(env.DYNATRACE_URL && env.DYNATRACE_API_TOKEN),
    };
  },
  get knowledge() {
    const env = loadEnv();
    return {
      endpoint: env.AZURE_SEARCH_ENDPOINT,
      key: env.AZURE_SEARCH_KEY,
      index: env.AZURE_SEARCH_INDEX,
    };
  },
  get redis() {
    const env = loadEnv();
    return {
      url: env.REDIS_URL,
    };
  },
  get sqlServer() {
    const env = loadEnv();
    return {
      server: env.SQL_SERVER_HOST,
      port: env.SQL_SERVER_PORT,
      database: env.SQL_SERVER_DATABASE,
      user: env.SQL_SERVER_USER,
      password: env.SQL_SERVER_PASSWORD,
      options: {
        encrypt: env.SQL_SERVER_ENCRYPT === "true",
        trustServerCertificate: env.SQL_SERVER_TRUST_CERT === "true",
      },
    };
  },
  get jwt() {
    const env = loadEnv();
    return {
      secret: env.JWT_SECRET,
    };
  },
};

export type Config = typeof config;
