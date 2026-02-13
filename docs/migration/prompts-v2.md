# Migrating to Prompt System V2

This guide explains how to migrate your agent prompts to the V2 Prompt System.

## Overview

Prompt System V2 focuses on structured XML tagging for better LLM parsing, dynamic dependency injection, and centralized management via the `AGENT_REGISTRY`.

## Key Changes

### 1. XML Tagging

V2 prompts use XML-style tags (`<context>`, `<task>`, `<constraints>`, `<output_format>`) to provide clear structure to the LLM.

### 2. Dynamic Injection

Prompts now support dynamic injection of team-specific context, available tools, and peer agent descriptions.

### 3. AGENT_REGISTRY Usage

All agents must be registered in the `AGENT_REGISTRY` to allow for automatic cross-referencing in prompts.

## Examples

### Before (V1)

```python
PROMPT = """You are a support agent.
Your task is to help the user with their issues.
Use the following context: {context}
"""
```

### After (V2)

```python
SYSTEM_PROMPT = """<role>
You are a specialized Support Agent within the {team_name} team.
</role>

<context>
{team_description}
{additional_context}
</context>

<available_agents>
{agent_registry_summary}
</available_agents>

<task>
Help the user resolve their specific issue using your assigned tools.
</task>

<constraints>
- Always be polite.
- Use XML tags for internal reasoning if needed.
- Refer to other agents if the task is outside your scope.
</constraints>

<output_format>
Provide a clear, concise solution or ask follow-up questions.
</output_format>
"""
```

## Migration Steps

1. Wrap existing prompt sections in appropriate XML tags.
2. Replace hardcoded agent lists with `{agent_registry_summary}`.
3. Ensure your prompt template handles the new required variables: `team_name`, `team_description`, and `agent_registry_summary`.
