import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3000),

  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_API_ENDPOINT: z.string().optional(),
  AZURE_OPENAI_DEPLOYMENT_NAME: z.string().optional(),
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME: z.string().optional(),
  AZURE_OPENAI_API_VERSION: z.string().default("2024-06-01"),

  DATABRICKS_HOST: z.string().optional(),
  DATABRICKS_TOKEN: z.string().optional(),
  DATABRICKS_SQL_WAREHOUSE_ID: z.string().optional(),
  DATABRICKS_GENIE_SPACE_ID: z.string().optional(),

  DYNATRACE_URL: z.string().optional(),
  DYNATRACE_API_TOKEN: z.string().optional(),

  AZURE_SEARCH_ENDPOINT: z.string().optional(),
  AZURE_SEARCH_KEY: z.string().optional(),
  AZURE_SEARCH_INDEX: z.string().optional(),

  REDIS_URL: z.string().default("redis://localhost:6379"),

  SQL_SERVER_HOST: z.string().optional(),
  SQL_SERVER_PORT: z.coerce.number().default(1433),
  SQL_SERVER_DATABASE: z.string().optional(),
  SQL_SERVER_USER: z.string().optional(),
  SQL_SERVER_PASSWORD: z.string().optional(),
  SQL_SERVER_ENCRYPT: z.enum(["true", "false"]).default("true"),
  SQL_SERVER_TRUST_CERT: z.enum(["true", "false"]).default("false"),

  JWT_SECRET: z.string().default("default-secret-change-in-production"),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

export const loadEnv = (): Env => {
  if (!cachedEnv) {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
      console.error("❌ Invalid environment variables:", result.error.format());
      throw new Error("Invalid environment variables");
    }

    cachedEnv = result.data;
  }
  return cachedEnv;
};

export const resetEnv = (): void => {
  cachedEnv = undefined;
};
