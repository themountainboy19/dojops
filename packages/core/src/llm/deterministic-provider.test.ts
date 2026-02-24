import { describe, it, expect, vi } from "vitest";
import { DeterministicProvider } from "./deterministic-provider";
import { LLMProvider, LLMRequest, LLMResponse } from "./provider";

function createMockProvider(overrides?: Partial<LLMProvider>): LLMProvider {
  return {
    name: "mock-provider",
    generate: vi.fn(async () => ({ content: "response" })),
    ...overrides,
  };
}

describe("DeterministicProvider", () => {
  it("forces temperature=0 even when request has temperature=0.5", async () => {
    const inner = createMockProvider();
    const provider = new DeterministicProvider(inner);

    await provider.generate({ prompt: "test", temperature: 0.5 });

    expect(inner.generate).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "test", temperature: 0 }),
    );
  });

  it("forces temperature=0 when no temperature in request", async () => {
    const inner = createMockProvider();
    const provider = new DeterministicProvider(inner);

    await provider.generate({ prompt: "test" });

    expect(inner.generate).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "test", temperature: 0 }),
    );
  });

  it("preserves all other request fields", async () => {
    const inner = createMockProvider();
    const provider = new DeterministicProvider(inner);

    const request: LLMRequest = {
      system: "you are a bot",
      prompt: "hello",
      temperature: 1.5,
      maxTokens: 100,
    };

    await provider.generate(request);

    expect(inner.generate).toHaveBeenCalledWith({
      system: "you are a bot",
      prompt: "hello",
      temperature: 0,
      maxTokens: 100,
    });
  });

  it("delegates name to inner provider", () => {
    const inner = createMockProvider({ name: "openai" });
    const provider = new DeterministicProvider(inner);
    expect(provider.name).toBe("openai");
  });

  it("delegates listModels to inner provider", async () => {
    const inner = createMockProvider({
      listModels: vi.fn(async () => ["gpt-4", "gpt-3.5"]),
    });
    const provider = new DeterministicProvider(inner);

    const models = await provider.listModels();
    expect(models).toEqual(["gpt-4", "gpt-3.5"]);
    expect(inner.listModels).toHaveBeenCalled();
  });

  it("returns empty array when inner provider has no listModels", async () => {
    const inner: LLMProvider = {
      name: "basic",
      generate: vi.fn(async () => ({ content: "ok" })),
    };
    // Remove listModels entirely
    delete (inner as Record<string, unknown>).listModels;
    const provider = new DeterministicProvider(inner);

    const models = await provider.listModels();
    expect(models).toEqual([]);
  });

  it("returns the inner generate response unchanged", async () => {
    const response: LLMResponse = { content: "generated output", parsed: { key: "value" } };
    const inner = createMockProvider({
      generate: vi.fn(async () => response),
    });
    const provider = new DeterministicProvider(inner);

    const result = await provider.generate({ prompt: "test" });
    expect(result).toEqual(response);
  });
});
