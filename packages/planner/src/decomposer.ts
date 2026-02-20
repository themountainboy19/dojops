import { LLMProvider } from "@oda/core";
import { DevOpsTool } from "@oda/sdk";
import { TaskGraph, TaskGraphSchema } from "./types";

export async function decompose(
  goal: string,
  provider: LLMProvider,
  tools: DevOpsTool[],
): Promise<TaskGraph> {
  const toolList = tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");

  const response = await provider.generate({
    system: `You are a DevOps task planner. Break down goals into tasks using available tools.

Available tools:
${toolList}

Respond with a JSON object matching this structure:
{
  "goal": "the original goal",
  "tasks": [
    {
      "id": "unique-id",
      "tool": "tool-name",
      "description": "what this task does",
      "dependsOn": ["id-of-dependency"],
      "input": { "key": "value or $ref:task-id for output from another task" }
    }
  ]
}`,
    prompt: goal,
    schema: TaskGraphSchema,
  });

  return response.parsed as TaskGraph;
}
