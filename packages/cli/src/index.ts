#!/usr/bin/env node

import "dotenv/config";
import { DevOpsAgent, OpenAIProvider, OllamaProvider, AnthropicProvider } from "@oda/core";

async function main() {
  const providerName = process.env.ODA_PROVIDER ?? "openai";

  let provider;

  if (providerName === "ollama") {
    provider = new OllamaProvider();
  } else if (providerName === "anthropic") {
    provider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY!);
  } else {
    provider = new OpenAIProvider(process.env.OPENAI_API_KEY!);
  }

  const agent = new DevOpsAgent(provider);
  const prompt = process.argv.slice(2).join(" ");

  const result = await agent.run(prompt);
  console.log(result.content);
}

main();