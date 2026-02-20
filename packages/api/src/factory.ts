import {
  OpenAIProvider,
  OllamaProvider,
  AnthropicProvider,
  LLMProvider,
  AgentRouter,
  CIDebugger,
  InfraDiffAnalyzer,
} from "@odaops/core";
import {
  GitHubActionsTool,
  TerraformTool,
  KubernetesTool,
  HelmTool,
  AnsibleTool,
} from "@odaops/tools";
import { DevOpsTool } from "@odaops/sdk";

export function createProvider(): LLMProvider {
  const providerName = process.env.ODA_PROVIDER ?? "openai";
  const model = process.env.ODA_MODEL;

  if (providerName === "ollama") {
    return new OllamaProvider(undefined, model);
  } else if (providerName === "anthropic") {
    return new AnthropicProvider(process.env.ANTHROPIC_API_KEY!, model);
  } else {
    return new OpenAIProvider(process.env.OPENAI_API_KEY!, model);
  }
}

export function createTools(provider: LLMProvider): DevOpsTool[] {
  return [
    new GitHubActionsTool(provider),
    new TerraformTool(provider),
    new KubernetesTool(provider),
    new HelmTool(provider),
    new AnsibleTool(provider),
  ];
}

export function createRouter(provider: LLMProvider): AgentRouter {
  return new AgentRouter(provider);
}

export function createDebugger(provider: LLMProvider): CIDebugger {
  return new CIDebugger(provider);
}

export function createDiffAnalyzer(provider: LLMProvider): InfraDiffAnalyzer {
  return new InfraDiffAnalyzer(provider);
}
