#!/usr/bin/env node

import "dotenv/config";
import {
  DevOpsAgent,
  OpenAIProvider,
  OllamaProvider,
  AnthropicProvider,
  LLMProvider,
} from "@oda/core";
import { decompose, PlannerExecutor } from "@oda/planner";
import { GitHubActionsTool } from "@oda/tools";

function createProvider(): LLMProvider {
  const providerName = process.env.ODA_PROVIDER ?? "openai";

  if (providerName === "ollama") {
    return new OllamaProvider();
  } else if (providerName === "anthropic") {
    return new AnthropicProvider(process.env.ANTHROPIC_API_KEY!);
  } else {
    return new OpenAIProvider(process.env.OPENAI_API_KEY!);
  }
}

async function runPlan(prompt: string, provider: LLMProvider) {
  const tools = [new GitHubActionsTool(provider)];

  console.log("Decomposing goal into tasks...\n");
  const graph = await decompose(prompt, provider, tools);

  console.log(`Goal: ${graph.goal}`);
  console.log(`Tasks (${graph.tasks.length}):`);
  for (const task of graph.tasks) {
    const deps = task.dependsOn.length ? ` (after: ${task.dependsOn.join(", ")})` : "";
    console.log(`  [${task.id}] ${task.tool}: ${task.description}${deps}`);
  }
  console.log();

  const executor = new PlannerExecutor(tools, {
    taskStart(id, desc) {
      console.log(`> Running ${id}: ${desc}`);
    },
    taskEnd(id, status, error) {
      if (error) {
        console.log(`  ${id}: ${status} - ${error}`);
      } else {
        console.log(`  ${id}: ${status}`);
      }
    },
  });

  const result = await executor.execute(graph);

  console.log(`\nPlan ${result.success ? "succeeded" : "failed"}.`);
  for (const r of result.results) {
    console.log(`  [${r.taskId}] ${r.status}${r.error ? `: ${r.error}` : ""}`);
  }
}

async function main() {
  const provider = createProvider();
  const args = process.argv.slice(2);
  const planMode = args.includes("--plan");
  const prompt = args.filter((a) => a !== "--plan").join(" ");

  if (!prompt) {
    console.log("Usage: oda [--plan] <prompt>");
    process.exit(1);
  }

  if (planMode) {
    await runPlan(prompt, provider);
  } else {
    const agent = new DevOpsAgent(provider);
    const result = await agent.run(prompt);
    console.log(result.content);
  }
}

main();
