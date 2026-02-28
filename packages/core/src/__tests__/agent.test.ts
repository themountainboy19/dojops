import { describe, it, expect, vi } from "vitest";
import { DevOpsAgent } from "../agent";
import { LLMProvider } from "../llm/provider";

function createMockProvider(response: string): LLMProvider {
  return {
    name: "mock",
    generate: vi.fn().mockResolvedValue({ content: response }),
  };
}

describe("DevOpsAgent", () => {
  it("delegates prompt to provider with system message", async () => {
    const provider = createMockProvider("hello");
    const agent = new DevOpsAgent(provider);

    const result = await agent.run("deploy nginx");

    expect(provider.generate).toHaveBeenCalledWith({
      system: "You are an expert DevOps engineer.",
      prompt: "deploy nginx",
    });
    expect(result).toEqual({ content: "hello" });
  });

  it("returns provider response unchanged", async () => {
    const provider = createMockProvider("kubectl apply -f deployment.yaml");
    const agent = new DevOpsAgent(provider);

    const result = await agent.run("deploy");

    expect(result.content).toBe("kubectl apply -f deployment.yaml");
  });
});
