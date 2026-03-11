import { describe, it, expect } from "vitest";
import { BaseModule, ModuleOutput, VerificationResult, z } from "../module";

const EchoInputSchema = z.object({
  message: z.string().min(1),
});

type EchoInput = z.infer<typeof EchoInputSchema>;

class EchoModule extends BaseModule<EchoInput> {
  name = "echo";
  description = "Echoes the input message";
  inputSchema = EchoInputSchema;

  async generate(input: EchoInput): Promise<ModuleOutput> {
    return { success: true, data: { echo: input.message } };
  }
}

describe("BaseModule", () => {
  it("validates correct input", () => {
    const mod = new EchoModule();
    const result = mod.validate({ message: "hello" });
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects input with wrong type", () => {
    const mod = new EchoModule();
    const result = mod.validate({ message: 123 });
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("rejects input with missing fields", () => {
    const mod = new EchoModule();
    const result = mod.validate({});
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("generates output from valid input", async () => {
    const mod = new EchoModule();
    const output = await mod.generate({ message: "hello" });
    expect(output.success).toBe(true);
    expect(output.data).toEqual({ echo: "hello" });
  });

  it("exposes module name and description", () => {
    const mod = new EchoModule();
    expect(mod.name).toBe("echo");
    expect(mod.description).toBe("Echoes the input message");
  });

  it("does not have verify by default", () => {
    const mod = new EchoModule();
    expect(mod.verify).toBeUndefined();
  });

  it("supports optional verify method on subclass", async () => {
    class VerifiableEchoModule extends EchoModule {
      async verify(): Promise<VerificationResult> {
        return { passed: true, tool: "echo-verify", issues: [] };
      }
    }

    const mod = new VerifiableEchoModule();
    expect(mod.verify).toBeDefined();
    const result = await mod.verify?.({});
    expect(result.passed).toBe(true);
    expect(result.tool).toBe("echo-verify");
    expect(result.issues).toHaveLength(0);
  });
});
