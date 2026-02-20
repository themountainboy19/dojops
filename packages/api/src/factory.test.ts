import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createProvider,
  createTools,
  createRouter,
  createDebugger,
  createDiffAnalyzer,
} from "./factory";

describe("factory", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("createProvider", () => {
    it("creates OllamaProvider when ODA_PROVIDER=ollama", () => {
      process.env.ODA_PROVIDER = "ollama";
      const provider = createProvider();
      expect(provider.name).toBe("ollama");
    });

    it("creates AnthropicProvider when ODA_PROVIDER=anthropic", () => {
      process.env.ODA_PROVIDER = "anthropic";
      process.env.ANTHROPIC_API_KEY = "test-key";
      const provider = createProvider();
      expect(provider.name).toBe("anthropic");
    });

    it("creates OpenAIProvider by default", () => {
      delete process.env.ODA_PROVIDER;
      process.env.OPENAI_API_KEY = "test-key";
      const provider = createProvider();
      expect(provider.name).toBe("openai");
    });

    it("creates OpenAIProvider for explicit openai", () => {
      process.env.ODA_PROVIDER = "openai";
      process.env.OPENAI_API_KEY = "test-key";
      const provider = createProvider();
      expect(provider.name).toBe("openai");
    });
  });

  describe("createTools", () => {
    it("creates 5 tools", () => {
      process.env.ODA_PROVIDER = "ollama";
      const provider = createProvider();
      const tools = createTools(provider);
      expect(tools).toHaveLength(5);
      const names = tools.map((t) => t.name);
      expect(names).toContain("github-actions");
      expect(names).toContain("terraform");
      expect(names).toContain("kubernetes");
      expect(names).toContain("helm");
      expect(names).toContain("ansible");
    });
  });

  describe("createRouter", () => {
    it("creates an AgentRouter with agents", () => {
      process.env.ODA_PROVIDER = "ollama";
      const provider = createProvider();
      const router = createRouter(provider);
      expect(router.getAgents().length).toBeGreaterThan(0);
    });
  });

  describe("createDebugger", () => {
    it("creates a CIDebugger instance", () => {
      process.env.ODA_PROVIDER = "ollama";
      const provider = createProvider();
      const debugger_ = createDebugger(provider);
      expect(debugger_).toBeDefined();
      expect(typeof debugger_.diagnose).toBe("function");
    });
  });

  describe("createDiffAnalyzer", () => {
    it("creates an InfraDiffAnalyzer instance", () => {
      process.env.ODA_PROVIDER = "ollama";
      const provider = createProvider();
      const analyzer = createDiffAnalyzer(provider);
      expect(analyzer).toBeDefined();
      expect(typeof analyzer.analyze).toBe("function");
    });
  });
});
