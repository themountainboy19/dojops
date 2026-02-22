import { describe, it, expect, vi } from "vitest";
import { DevOpsChecker, CheckReportSchema } from "./devops-checker";
import type { LLMProvider } from "../llm/provider";

describe("DevOpsChecker", () => {
  it("calls provider with context and file contents and returns structured report", async () => {
    const mockReport = {
      summary: "The project has a solid CI setup but lacks security hardening.",
      score: 62,
      findings: [
        {
          file: "Dockerfile",
          category: "security" as const,
          severity: "warning" as const,
          message: "Running as root user",
          recommendation: "Add USER directive to run as non-root",
        },
        {
          file: ".github/workflows/ci.yml",
          category: "best-practice" as const,
          severity: "info" as const,
          message: "No dependency caching configured",
          recommendation: "Add actions/cache step for node_modules",
        },
      ],
      missingFiles: [".dockerignore", "CODEOWNERS"],
    };

    const mockProvider: LLMProvider = {
      name: "mock",
      generate: vi.fn().mockResolvedValue({
        content: JSON.stringify(mockReport),
        parsed: mockReport,
      }),
    };

    const checker = new DevOpsChecker(mockProvider);
    const result = await checker.check(JSON.stringify({ version: 2, ci: [], container: {} }), [
      { path: "Dockerfile", content: "FROM node:20\nRUN npm install" },
      { path: ".github/workflows/ci.yml", content: "name: CI\non: push" },
    ]);

    // Provider was called
    expect(mockProvider.generate).toHaveBeenCalledTimes(1);

    // Verify prompt structure
    const call = vi.mocked(mockProvider.generate).mock.calls[0][0];
    expect(call.system).toContain("senior DevOps engineer");
    expect(call.prompt).toContain("Dockerfile");
    expect(call.prompt).toContain("FROM node:20");
    expect(call.prompt).toContain("Project Context");
    expect(call.schema).toBeDefined();

    // Verify result matches schema
    const parsed = CheckReportSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    expect(result.score).toBe(62);
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0].severity).toBe("warning");
    expect(result.missingFiles).toContain(".dockerignore");
  });

  it("falls back to parseAndValidate when parsed is absent", async () => {
    const mockReport = {
      summary: "Minimal setup.",
      score: 20,
      findings: [],
      missingFiles: [],
    };

    const mockProvider: LLMProvider = {
      name: "mock",
      generate: vi.fn().mockResolvedValue({
        content: JSON.stringify(mockReport),
        // No parsed field — forces fallback
      }),
    };

    const checker = new DevOpsChecker(mockProvider);
    const result = await checker.check("{}", []);

    const parsed = CheckReportSchema.safeParse(result);
    expect(parsed.success).toBe(true);
    expect(result.score).toBe(20);
  });
});
