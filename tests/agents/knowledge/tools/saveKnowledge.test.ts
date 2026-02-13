import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.unstable_mockModule("../../../../src/services/azureSearch.js", () => ({
  indexDocument: jest.fn<any>(),
}));

jest.unstable_mockModule("@langchain/langgraph", () => ({
  interrupt: jest.fn<any>(),
}));

const azureSearch = await import("../../../../src/services/azureSearch.js");
const { interrupt } = await import("@langchain/langgraph");
const { saveKnowledgeTool } =
  await import("../../../../src/agents/knowledge/tools/saveKnowledge.js");

describe("save_knowledge tool", () => {
  beforeEach(() => {
    (azureSearch.indexDocument as any).mockClear();
    (interrupt as any).mockClear();
  });

  it("should have the correct name and description", () => {
    expect(saveKnowledgeTool.name).toBe("save_knowledge");
    expect(saveKnowledgeTool.description).toBe(
      "Saves verified knowledge to the database for future retrieval.",
    );
  });

  it("should call interrupt and then indexDocument when approved", async () => {
    const mockIndexDocument = azureSearch.indexDocument as any;
    mockIndexDocument.mockResolvedValue(undefined);

    const mockInterrupt = interrupt as any;
    mockInterrupt.mockResolvedValue({ action: "accept" });

    const input = {
      content: "Test knowledge content",
      source: "manual entry",
      tags: ["test", "jest"],
    };

    const result = await saveKnowledgeTool.invoke(input);

    expect(mockInterrupt).toHaveBeenCalled();
    expect(mockIndexDocument).toHaveBeenCalledWith(input.content, {
      source: input.source,
      tags: input.tags,
    });
    expect(result).toBe(
      `Successfully saved knowledge from source: ${input.source}`,
    );
  });

  it("should return rejection message when rejected", async () => {
    const mockIndexDocument = azureSearch.indexDocument as any;
    const mockInterrupt = interrupt as any;
    mockInterrupt.mockResolvedValue({ action: "reject" });

    const input = {
      content: "Test knowledge content",
      source: "manual entry",
      tags: ["test"],
    };

    const result = await saveKnowledgeTool.invoke(input);

    expect(mockInterrupt).toHaveBeenCalled();
    expect(mockIndexDocument).not.toHaveBeenCalled();
    expect(result).toBe("Knowledge saving was rejected.");
  });

  it("should use edited content when edited", async () => {
    const mockIndexDocument = azureSearch.indexDocument as any;
    mockIndexDocument.mockResolvedValue(undefined);

    const editedContent = {
      content: "Edited content",
      source: "edited source",
      tags: ["edited"],
    };
    const mockInterrupt = interrupt as any;
    mockInterrupt.mockResolvedValue({
      action: "edit",
      value: editedContent,
    });

    const input = {
      content: "Original content",
      source: "original source",
      tags: ["original"],
    };

    const result = await saveKnowledgeTool.invoke(input);

    expect(mockInterrupt).toHaveBeenCalled();
    expect(mockIndexDocument).toHaveBeenCalledWith(editedContent.content, {
      source: editedContent.source,
      tags: editedContent.tags,
    });
    expect(result).toBe(
      `Successfully saved knowledge from source: ${editedContent.source}`,
    );
  });

  it("should return an error message when indexDocument fails", async () => {
    const mockIndexDocument = azureSearch.indexDocument as any;
    const errorMessage = "Azure Search error";
    mockIndexDocument.mockRejectedValue(new Error(errorMessage));

    const mockInterrupt = interrupt as any;
    mockInterrupt.mockResolvedValue({ action: "accept" });

    const input = {
      content: "Test knowledge content",
      source: "manual entry",
      tags: ["test"],
    };

    const result = await saveKnowledgeTool.invoke(input);

    expect(result).toBe(`Failed to save knowledge: ${errorMessage}`);
  });
});
