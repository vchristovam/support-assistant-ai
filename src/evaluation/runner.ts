import { BaseChatModel } from "@langchain/core/language_models/chat_models";

export interface EvaluationResult {
  score: number;
  reasoning: string;
  criteria: string;
}

export const evaluateResponse = async (
  llm: BaseChatModel,
  promptTemplate: string,
  input: Record<string, string>
): Promise<EvaluationResult> => {
  let prompt = promptTemplate;
  for (const [key, value] of Object.entries(input)) {
    prompt = prompt.replace(`{${key}}`, value);
  }

  const result = await llm.invoke([
    { role: "user", content: prompt }
  ]);

  const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
  
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        score: parsed.overall_score || parsed.score || 0,
        reasoning: parsed.summary || parsed.findings || parsed.explanation || "",
        criteria: "custom"
      };
    }
  } catch (e) {
    console.error("Failed to parse evaluation result", e);
  }

  return {
    score: 0,
    reasoning: content,
    criteria: "manual_review"
  };
};

export const runEvaluationSuite = async (
  suite: any[],
  evaluator: (input: any) => Promise<any>
) => {
  const results = [];
  for (const caseItem of suite) {
    const result = await evaluator(caseItem);
    results.push({ ...caseItem, result });
  }
  return results;
};
