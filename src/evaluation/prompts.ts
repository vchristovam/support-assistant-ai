/**
 * Prompts for evaluating the quality of research and assistant responses.
 * Adapted from open_deep_research patterns for Phase 6 evaluation.
 */

/**
 * Evaluates the overall quality of the research response.
 * Criteria: Research Depth, Source Quality, Answer Accuracy, Relevance, Structure, Clarity.
 */
export const OVERALL_QUALITY_PROMPT = `
You are an expert evaluator assessing the quality of a research response.
Evaluate the following response based on these criteria:

1. **Research Depth**: Does the response demonstrate thorough investigation? Does it cover multiple facets of the query?
2. **Source Quality**: Are the sources used (provided in context) effectively integrated and cited?
3. **Answer Accuracy**: Is the information provided factually correct based on the context?
4. **Relevance**: Does the response directly address the user's query?
5. **Structure**: Is the response well-organized with clear sections or a logical flow?
6. **Clarity**: Is the language clear, professional, and easy to understand?

Provide a score from 1-10 for each criterion and an overall summary.

---
**Query:**
{query}

**Context:**
{context}

**Response:**
{response}
---

Your evaluation (JSON format):
{
  "scores": {
    "research_depth": number,
    "source_quality": number,
    "accuracy": number,
    "relevance": number,
    "structure": number,
    "clarity": number
  },
  "overall_score": number,
  "summary": "string"
}
`.trim();

/**
 * Evaluates the correctness of the response against a reference answer.
 */
export const CORRECTNESS_PROMPT = `
You are an expert evaluator comparing an assistant's response to a gold-standard reference answer.

**Query:**
{query}

**Reference Answer (Ground Truth):**
{reference_answer}

**Assistant Response:**
{response}

Evaluate if the assistant's response is factually consistent with the reference answer. 
Identify any contradictions, omissions of key facts, or hallucinations.

Your evaluation (JSON format):
{
  "is_correct": boolean,
  "consistency_score": number (0-1),
  "findings": "string"
}
`.trim();

/**
 * Evaluates the relevance of the response to the query.
 */
export const RELEVANCE_PROMPT = `
Evaluate how relevant the following response is to the user's query.

**Query:**
{query}

**Response:**
{response}

Does the response stay on topic? Does it provide unnecessary information? Does it miss the core intent of the query?

Your evaluation (JSON format):
{
  "relevance_score": number (0-1),
  "explanation": "string"
}
`.trim();

/**
 * Evaluates the structure and formatting of the response.
 */
export const STRUCTURE_PROMPT = `
Evaluate the structure and formatting of the following response.

**Response:**
{response}

Check for:
- Logical organization
- Use of headings/lists where appropriate
- Coherence between paragraphs
- Professional formatting

Your evaluation (JSON format):
{
  "structure_score": number (0-1),
  "feedback": "string"
}
`.trim();
