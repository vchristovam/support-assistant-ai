import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import { resetEnv } from "../src/config/env.js";

describe("Configuration", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    resetEnv();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should parse valid config correctly with all env vars set", async () => {
    process.env.AZURE_OPENAI_API_KEY = "test-key";
    process.env.AZURE_OPENAI_API_ENDPOINT = "https://test.openai.azure.com/";
    process.env.AZURE_OPENAI_DEPLOYMENT_NAME = "test-deployment";
    process.env.AZURE_OPENAI_API_VERSION = "2024-06-01";
    process.env.DATABRICKS_HOST = "https://test.databricks.com";
    process.env.DATABRICKS_TOKEN = "test-token";
    process.env.DATABRICKS_SQL_WAREHOUSE_ID = "test-warehouse";
    process.env.DATABRICKS_GENIE_SPACE_ID = "test-genie";
    process.env.DYNATRACE_URL = "https://test.dynatrace.com";
    process.env.DYNATRACE_API_TOKEN = "test-dt-token";
    process.env.AZURE_SEARCH_ENDPOINT = "https://test.search.azure.com";
    process.env.AZURE_SEARCH_KEY = "test-search-key";
    process.env.AZURE_SEARCH_INDEX = "test-index";
    process.env.REDIS_URL = "redis://test-redis:6379";
    process.env.PORT = "4000";
    process.env.NODE_ENV = "production";

    const { config: freshConfig } =
      (await import("../src/config/index.js")) as any;

    expect(freshConfig.azureOpenAI.apiKey).toBe("test-key");
    expect(freshConfig.app.port).toBe(4000);
    expect(freshConfig.app.env).toBe("production");
    expect(freshConfig.redis.url).toBe("redis://test-redis:6379");
  });

  it("should use defaults for optional vars when not set", async () => {
    delete process.env.PORT;
    delete process.env.NODE_ENV;
    delete process.env.REDIS_URL;

    const { config: freshConfig } =
      (await import("../src/config/index.js")) as any;

    expect(freshConfig.app.port).toBe(3000);
    expect(freshConfig.app.env).toBe("development");
    expect(freshConfig.app.isDev).toBe(true);
    expect(freshConfig.redis.url).toBe("redis://localhost:6379");
  });

  it("should handle missing optional vars without failure", async () => {
    delete process.env.DATABRICKS_HOST;
    const { config: freshConfig } =
      (await import("../src/config/index.js")) as any;
    expect(freshConfig.databricks.host).toBeUndefined();
  });

  it("should have all expected grouped keys", async () => {
    const { config } = (await import("../src/config/index.js")) as any;
    expect(config).toHaveProperty("app");
    expect(config).toHaveProperty("azureOpenAI");
    expect(config).toHaveProperty("databricks");
    expect(config).toHaveProperty("dynatrace");
    expect(config).toHaveProperty("knowledge");
    expect(config).toHaveProperty("redis");
  });
});
