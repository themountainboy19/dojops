import { vi } from "vitest";
import { LLMProvider, LLMResponse, AgentRouter, CIDebugger, InfraDiffAnalyzer } from "@dojops/core";
import { DevOpsModule } from "@dojops/sdk";
import { AppDependencies } from "../app";
import { HistoryStore } from "../store";

/**
 * Creates a mock LLM provider with a simple generate stub.
 * Override the generate mock externally when you need custom behavior.
 */
export function createMockProvider(): LLMProvider {
  return {
    name: "mock",
    generate: vi.fn().mockResolvedValue({
      content: "Mock response",
    } satisfies LLMResponse),
  };
}

/**
 * Creates a mock DevOpsModule with stubbed validate and generate.
 */
export function createMockTool(): DevOpsModule {
  return {
    name: "mock-tool",
    description: "A mock tool",
    inputSchema: { safeParse: () => ({ success: true, data: {} }) } as never,
    validate: () => ({ valid: true }),
    generate: vi.fn().mockResolvedValue({ success: true, data: { yaml: "test: true" } }),
  };
}

/**
 * Creates a full set of AppDependencies for integration/route testing.
 * Accepts an optional rootDir for metrics-enabled tests.
 */
export function createTestDeps(rootDir?: string): AppDependencies {
  const provider = createMockProvider();
  const tools = [createMockTool()];
  const router = new AgentRouter(provider);
  const debugger_ = new CIDebugger(provider);
  const diffAnalyzer = new InfraDiffAnalyzer(provider);
  const store = new HistoryStore();

  return { provider, tools, router, debugger: debugger_, diffAnalyzer, store, rootDir };
}
