import { describe, it, expect, vi } from "vitest";
import { BaseTool, ToolOutput, VerificationResult, z } from "@dojops/sdk";
import { SafeExecutor } from "../safe-executor";
import { AutoApproveHandler, AutoDenyHandler, CallbackApprovalHandler } from "../approval";
import type { ExecutionPolicy } from "../types";

// ---------------------------------------------------------------------------
// Shared schema & types
// ---------------------------------------------------------------------------
const MockInputSchema = z.object({ value: z.string() });
type MockInput = z.infer<typeof MockInputSchema>;

// ---------------------------------------------------------------------------
// Base tool classes (reduced from 11 via shared base classes)
// ---------------------------------------------------------------------------

/** Standard tool with generate + execute */
class MockTool extends BaseTool<MockInput> {
  name = "mock-tool";
  description = "A mock tool";
  inputSchema = MockInputSchema;

  async generate(input: MockInput): Promise<ToolOutput> {
    return { success: true, data: { result: input.value } };
  }

  async execute(input: MockInput): Promise<ToolOutput> {
    return { success: true, data: { executed: input.value } };
  }
}

/** Tool without execute (generate-only) */
class GenerateOnlyTool extends BaseTool<MockInput> {
  name = "generate-only";
  description = "A tool without execute";
  inputSchema = MockInputSchema;

  async generate(input: MockInput): Promise<ToolOutput> {
    return { success: true, data: { result: input.value } };
  }
}

/** Tool whose generate always fails */
class FailingTool extends BaseTool<MockInput> {
  name = "failing-tool";
  description = "Always fails generate";
  inputSchema = MockInputSchema;

  async generate(): Promise<ToolOutput> {
    return { success: false, error: "generation failed" };
  }
}

/** Tool whose generate exceeds timeout */
class SlowTool extends BaseTool<MockInput> {
  name = "slow-tool";
  description = "Exceeds timeout";
  inputSchema = MockInputSchema;

  async generate(): Promise<ToolOutput> {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { success: true, data: {} };
  }
}

/** Tool that returns token usage */
class UsageTrackingTool extends BaseTool<MockInput> {
  name = "usage-tool";
  description = "Returns token usage";
  inputSchema = MockInputSchema;
  async generate(input: MockInput): Promise<ToolOutput> {
    return {
      success: true,
      data: { result: input.value },
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    };
  }
}

// ---------------------------------------------------------------------------
// Verifiable tool base — shared generate + execute, configurable verify
// ---------------------------------------------------------------------------
abstract class VerifiableBase extends BaseTool<MockInput> {
  inputSchema = MockInputSchema;

  async generate(input: MockInput): Promise<ToolOutput> {
    return { success: true, data: { result: input.value } };
  }

  async execute(input: MockInput): Promise<ToolOutput> {
    return { success: true, data: { executed: input.value } };
  }
}

class VerifiableTool extends VerifiableBase {
  name = "verifiable-tool";
  description = "A tool with passing verify";

  async verify(): Promise<VerificationResult> {
    return { passed: true, tool: "test-verify", issues: [] };
  }
}

class FailingVerifyTool extends VerifiableBase {
  name = "failing-verify-tool";
  description = "A tool with failing verify";

  async verify(): Promise<VerificationResult> {
    return {
      passed: false,
      tool: "test-verify",
      issues: [{ severity: "error", message: "Invalid config" }],
    };
  }
}

class SlowVerifyTool extends VerifiableBase {
  name = "slow-verify-tool";
  description = "Verify hangs";

  async verify(): Promise<VerificationResult> {
    await new Promise((r) => setTimeout(r, 5000));
    return { passed: true, tool: "slow-verify", issues: [] };
  }
}

class ThrowingVerifyTool extends VerifiableBase {
  name = "throwing-verify-tool";
  description = "Verify throws";

  async verify(): Promise<VerificationResult> {
    throw new Error("kubectl not found");
  }
}

// ---------------------------------------------------------------------------
// Execute-variant tools — shared generate, configurable execute
// ---------------------------------------------------------------------------
abstract class ExecuteVariantBase extends BaseTool<MockInput> {
  inputSchema = MockInputSchema;

  async generate(input: MockInput): Promise<ToolOutput> {
    return { success: true, data: { result: input.value } };
  }
}

class SlowExecuteTool extends ExecuteVariantBase {
  name = "slow-execute-tool";
  description = "Execute hangs";

  async execute(): Promise<ToolOutput> {
    await new Promise((r) => setTimeout(r, 5000));
    return { success: true, data: {} };
  }
}

class FailingExecuteTool extends ExecuteVariantBase {
  name = "failing-execute-tool";
  description = "Execute fails";

  async execute(): Promise<ToolOutput> {
    return { success: false, error: "disk full" };
  }
}

class FileTrackingTool extends ExecuteVariantBase {
  name = "file-tracking-tool";
  description = "Writes files";

  async execute(): Promise<ToolOutput> {
    return {
      success: true,
      data: {},
      filesWritten: ["/tmp/new.yaml"],
      filesModified: ["/tmp/existing.yaml"],
    };
  }
}

// ---------------------------------------------------------------------------
// File-write tool factory for allowlist tests (replaces 3 inline classes)
// ---------------------------------------------------------------------------
function createFileWriteTool(name: string, filesWritten: string[], filesModified: string[] = []) {
  return new (class extends ExecuteVariantBase {
    override name = name;
    description = `Writes to files: ${filesWritten.join(", ")}`;

    async execute(): Promise<ToolOutput> {
      return { success: true, data: {}, filesWritten, filesModified };
    }
  })();
}

// ---------------------------------------------------------------------------
// Executor factory — eliminates repeated SafeExecutor construction
// ---------------------------------------------------------------------------
function createExecutor(
  policyOverrides: Partial<ExecutionPolicy> = {},
  approvalHandler = new AutoApproveHandler(),
) {
  return new SafeExecutor({
    policy: policyOverrides,
    approvalHandler,
  });
}

/** Shorthand: no-approval executor (the most common variant) */
function createNoApprovalExecutor(extraPolicy: Partial<ExecutionPolicy> = {}) {
  return createExecutor({ requireApproval: false, ...extraPolicy });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("SafeExecutor", () => {
  it("executes a tool through generate and execute with approval", async () => {
    const executor = createExecutor({ requireApproval: true });

    const result = await executor.executeTask("t1", new MockTool(), { value: "hello" });

    expect(result.status).toBe("completed");
    expect(result.approval).toBe("approved");
    expect(result.output).toEqual({ executed: "hello" });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("denies execution when approval handler denies", async () => {
    const executor = createExecutor({ requireApproval: true }, new AutoDenyHandler());

    const result = await executor.executeTask("t1", new MockTool(), { value: "hello" });

    expect(result.status).toBe("denied");
    expect(result.approval).toBe("denied");
  });

  it("skips approval when requireApproval is false", async () => {
    const callback = vi.fn().mockResolvedValue("approved");
    const executor = createExecutor(
      { requireApproval: false },
      new CallbackApprovalHandler(callback),
    );

    const result = await executor.executeTask("t1", new MockTool(), { value: "hello" });

    expect(result.status).toBe("completed");
    expect(result.approval).toBe("approved");
    expect(callback).not.toHaveBeenCalled();
  });

  it("skips execute phase for tools without execute method", async () => {
    const executor = createExecutor({ requireApproval: true });

    const result = await executor.executeTask("t1", new GenerateOnlyTool(), { value: "hello" });

    expect(result.status).toBe("completed");
    expect(result.approval).toBe("skipped");
    expect(result.output).toEqual({ result: "hello" });
  });

  it("returns failed when generate fails", async () => {
    const executor = createNoApprovalExecutor();

    const result = await executor.executeTask("t1", new FailingTool(), { value: "hello" });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("generation failed");
  });

  it("returns failed when validation fails", async () => {
    const executor = createNoApprovalExecutor();

    const result = await executor.executeTask("t1", new MockTool(), { value: 123 });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Validation failed");
  });

  it("returns timeout when tool exceeds timeout", async () => {
    const executor = createNoApprovalExecutor({ timeoutMs: 100 });

    const result = await executor.executeTask("t1", new SlowTool(), { value: "hello" });

    expect(result.status).toBe("timeout");
    expect(result.error).toContain("timed out");
  });

  it("maintains an audit log of all executions", async () => {
    const executor = createNoApprovalExecutor();

    await executor.executeTask("t1", new MockTool(), { value: "first" });
    await executor.executeTask("t2", new FailingTool(), { value: "second" });

    const log = executor.getAuditLog();
    expect(log).toHaveLength(2);
    expect(log[0].taskId).toBe("t1");
    expect(log[0].status).toBe("completed");
    expect(log[1].taskId).toBe("t2");
    expect(log[1].status).toBe("failed");
  });

  it("passes approval request with preview to handler", async () => {
    const callback = vi.fn().mockResolvedValue("approved");
    const executor = createExecutor(
      { requireApproval: true },
      new CallbackApprovalHandler(callback),
    );

    await executor.executeTask("t1", new MockTool(), { value: "hello" });

    expect(callback).toHaveBeenCalledTimes(1);
    const request = callback.mock.calls[0][0];
    expect(request.taskId).toBe("t1");
    expect(request.toolName).toBe("mock-tool");
    expect(request.preview).toBeDefined();
    expect(request.preview.summary).toContain("mock-tool");
  });

  it("runs verification and continues when it passes", async () => {
    const executor = createNoApprovalExecutor({ skipVerification: false });

    const result = await executor.executeTask("t1", new VerifiableTool(), { value: "hello" });

    expect(result.status).toBe("completed");
    expect(result.verification).toBeDefined();
    expect(result.verification!.passed).toBe(true);
    expect(result.output).toEqual({ executed: "hello" });
  });

  it("returns failed when verification fails", async () => {
    const executor = createNoApprovalExecutor({ skipVerification: false });

    const result = await executor.executeTask("t1", new FailingVerifyTool(), { value: "hello" });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Verification failed");
    expect(result.verification).toBeDefined();
    expect(result.verification!.passed).toBe(false);
  });

  it("skips verification for tools without verify method", async () => {
    const executor = createNoApprovalExecutor({ skipVerification: false });

    const result = await executor.executeTask("t1", new MockTool(), { value: "hello" });

    expect(result.status).toBe("completed");
    expect(result.verification).toBeUndefined();
  });

  it("skips verification when skipVerification is true", async () => {
    const verifySpy = vi.spyOn(VerifiableTool.prototype, "verify");
    const executor = createNoApprovalExecutor({ skipVerification: true });

    const result = await executor.executeTask("t1", new VerifiableTool(), { value: "hello" });

    expect(result.status).toBe("completed");
    expect(verifySpy).not.toHaveBeenCalled();
    expect(result.verification).toBeUndefined();
    verifySpy.mockRestore();
  });

  describe("verify-phase timeout", () => {
    it("returns failed status when verify phase exceeds timeout", async () => {
      const executor = createNoApprovalExecutor({
        skipVerification: false,
        verifyTimeoutMs: 100,
      });

      const result = await executor.executeTask("t1", new SlowVerifyTool(), { value: "hello" });

      expect(result.status).toBe("failed");
      expect(result.error).toContain("Verification");
      expect(result.error).toContain("timed out");
      expect(result.verification).toBeDefined();
      expect(result.verification!.passed).toBe(false);
    });
  });

  describe("verify throwing unexpected error", () => {
    it("returns failed with synthetic VerificationResult when verify throws", async () => {
      const executor = createNoApprovalExecutor({ skipVerification: false });

      const result = await executor.executeTask("t1", new ThrowingVerifyTool(), { value: "hello" });

      expect(result.status).toBe("failed");
      expect(result.error).toContain("Verification threw unexpectedly: kubectl not found");
      expect(result.verification).toBeDefined();
      expect(result.verification!.passed).toBe(false);
      expect(result.verification!.issues).toHaveLength(1);
      expect(result.verification!.issues[0].severity).toBe("error");
      expect(result.verification!.issues[0].message).toContain("kubectl not found");
    });
  });

  describe("token usage accumulation", () => {
    it("accumulates token usage across multiple executeTask calls", async () => {
      const executor = createNoApprovalExecutor();

      await executor.executeTask("t1", new UsageTrackingTool(), { value: "first" });
      await executor.executeTask("t2", new UsageTrackingTool(), { value: "second" });
      await executor.executeTask("t3", new UsageTrackingTool(), { value: "third" });

      const usage = executor.getTokenUsage();
      expect(usage.prompt).toBe(300);
      expect(usage.completion).toBe(150);
      expect(usage.total).toBe(450);
    });

    it("returns zeros when tools do not return usage", async () => {
      const executor = createNoApprovalExecutor();

      await executor.executeTask("t1", new MockTool(), { value: "no-usage" });
      await executor.executeTask("t2", new GenerateOnlyTool(), { value: "no-usage" });

      const usage = executor.getTokenUsage();
      expect(usage.prompt).toBe(0);
      expect(usage.completion).toBe(0);
      expect(usage.total).toBe(0);
    });
  });

  describe("execute phase timeout", () => {
    it("returns timeout status when execute phase exceeds executeTimeoutMs", async () => {
      const executor = createNoApprovalExecutor({ executeTimeoutMs: 100 });

      const result = await executor.executeTask("t1", new SlowExecuteTool(), { value: "hello" });

      expect(result.status).toBe("timeout");
      expect(result.error).toContain("timed out");
    });
  });

  describe("execute phase failure", () => {
    it("returns failed status when execute returns success=false", async () => {
      const executor = createNoApprovalExecutor();

      const result = await executor.executeTask("t1", new FailingExecuteTool(), { value: "hello" });

      expect(result.status).toBe("failed");
      expect(result.error).toBe("disk full");
      expect(result.approval).toBe("approved");
    });
  });

  describe("metadata enrichment", () => {
    it("enriches audit entry with tool metadata", async () => {
      const executor = createNoApprovalExecutor();

      const metadata = {
        toolType: "custom" as const,
        toolSource: "project" as const,
        toolVersion: "1.2.3",
        toolHash: "sha256:abc123",
      };

      await executor.executeTask("t1", new MockTool(), { value: "hello" }, metadata);

      const log = executor.getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0].toolType).toBe("custom");
      expect(log[0].toolSource).toBe("project");
      expect(log[0].toolVersion).toBe("1.2.3");
      expect(log[0].toolHash).toBe("sha256:abc123");
    });
  });

  describe("files tracking", () => {
    it("captures filesWritten and filesModified in the audit entry", async () => {
      const executor = createNoApprovalExecutor();

      const result = await executor.executeTask("t1", new FileTrackingTool(), { value: "hello" });

      expect(result.status).toBe("completed");

      const log = executor.getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0].filesWritten).toEqual(["/tmp/new.yaml"]);
      expect(log[0].filesModified).toEqual(["/tmp/existing.yaml"]);
    });
  });

  describe("T-10: concurrent execute() calls", () => {
    it("both concurrent executeTask calls complete without corruption", async () => {
      const executor = createNoApprovalExecutor();

      const [result1, result2] = await Promise.all([
        executor.executeTask("t1", new MockTool(), { value: "first" }),
        executor.executeTask("t2", new MockTool(), { value: "second" }),
      ]);

      expect(result1.status).toBe("completed");
      expect(result2.status).toBe("completed");
      expect(result1.output).toEqual({ executed: "first" });
      expect(result2.output).toEqual({ executed: "second" });

      const log = executor.getAuditLog();
      expect(log).toHaveLength(2);
      const taskIds = log.map((e) => e.taskId).sort((a, b) => a.localeCompare(b));
      expect(taskIds).toEqual(["t1", "t2"]);
    });

    it("concurrent execute() calls to the same tool produce independent results", async () => {
      const executor = createNoApprovalExecutor();

      const results = await Promise.all([
        executor.executeTask("concurrent-1", new FileTrackingTool(), { value: "a" }),
        executor.executeTask("concurrent-2", new FileTrackingTool(), { value: "b" }),
        executor.executeTask("concurrent-3", new FileTrackingTool(), { value: "c" }),
      ]);

      // All should complete
      for (const result of results) {
        expect(result.status).toBe("completed");
      }

      const log = executor.getAuditLog();
      expect(log).toHaveLength(3);

      // Each audit entry should have its own file tracking
      for (const entry of log) {
        expect(entry.filesWritten).toEqual(["/tmp/new.yaml"]);
        expect(entry.filesModified).toEqual(["/tmp/existing.yaml"]);
      }
    });

    it("concurrent mix of passing and failing tools does not corrupt state", async () => {
      const executor = createNoApprovalExecutor();

      const [success, failure] = await Promise.all([
        executor.executeTask("pass-task", new MockTool(), { value: "ok" }),
        executor.executeTask("fail-task", new FailingTool(), { value: "bad" }),
      ]);

      expect(success.status).toBe("completed");
      expect(failure.status).toBe("failed");

      const log = executor.getAuditLog();
      expect(log).toHaveLength(2);

      const successLog = log.find((e) => e.taskId === "pass-task");
      const failLog = log.find((e) => e.taskId === "fail-task");
      expect(successLog!.status).toBe("completed");
      expect(failLog!.status).toBe("failed");
    });
  });

  describe("T-13: SafeExecutor policy + DevOps allowlist interaction", () => {
    const allowlistPolicy = (enforceDevOpsAllowlist: boolean): Partial<ExecutionPolicy> => ({
      requireApproval: false,
      allowWrite: true,
      enforceDevOpsAllowlist,
      allowedWritePaths: [],
      deniedWritePaths: [],
    });

    it.each([
      {
        scenario: "blocks non-DevOps file write when enforceDevOpsAllowlist is true",
        enforce: true,
        taskId: "t-allowlist",
        toolName: "non-devops-write-tool",
        filesWritten: ["src/index.ts"],
        filesModified: [] as string[],
        expectedStatus: "failed",
        expectedErrorContains: ["Policy violation", "not a recognized DevOps file"],
      },
      {
        scenario: "allows any file write when enforceDevOpsAllowlist is false",
        enforce: false,
        taskId: "t-no-allowlist",
        toolName: "any-file-write-tool",
        filesWritten: ["src/index.ts"],
        filesModified: ["package.json"],
        expectedStatus: "completed",
        expectedErrorContains: [] as string[],
      },
      {
        scenario: "allows DevOps file writes when enforceDevOpsAllowlist is true",
        enforce: true,
        taskId: "t-devops-ok",
        toolName: "devops-write-tool",
        filesWritten: ["Dockerfile", "main.tf"],
        filesModified: [] as string[],
        expectedStatus: "completed",
        expectedErrorContains: [] as string[],
      },
    ])(
      "$scenario",
      async ({
        enforce,
        taskId,
        toolName,
        filesWritten,
        filesModified,
        expectedStatus,
        expectedErrorContains,
      }) => {
        const executor = createExecutor(allowlistPolicy(enforce));
        const tool = createFileWriteTool(toolName, filesWritten, filesModified);

        const result = await executor.executeTask(taskId, tool, { value: "test" });

        expect(result.status).toBe(expectedStatus);
        for (const fragment of expectedErrorContains) {
          expect(result.error).toContain(fragment);
        }
      },
    );
  });
});
