# 1. Prompt XML Tagging

## Status
Accepted

## Context
As the complexity of prompts grows, especially when dealing with multiple data sources and instructions, plain text or simple markdown becomes difficult for the LLM to parse reliably and for developers to maintain. We need a way to structure prompt sections that is both human-readable and machine-understandable.

## Decision
We will use XML-style tagging to encapsulate different parts of the prompts (e.g., `<context>`, `<instructions>`, `<data>`).

## Consequences
- **Better parsing**: LLMs are generally more proficient at identifying and adhering to instructions within distinct XML tags.
- **Clearer structure**: The modular nature of XML tags makes prompts easier to read and debug.
- **Improved consistency**: Standardizing tags across the project ensures a uniform approach to prompt engineering.
