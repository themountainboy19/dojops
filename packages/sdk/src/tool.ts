import { z, ZodTypeAny } from "zod";

export { z };

export interface ToolOutput {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface DevOpsTool<TInput = unknown> {
  name: string;
  description: string;
  inputSchema: ZodTypeAny;
  validate(input: unknown): { valid: boolean; error?: string };
  generate(input: TInput): Promise<ToolOutput>;
  execute?(input: TInput): Promise<ToolOutput>;
}

export abstract class BaseTool<TInput> implements DevOpsTool<TInput> {
  abstract name: string;
  abstract description: string;
  abstract inputSchema: ZodTypeAny;

  validate(input: unknown): { valid: boolean; error?: string } {
    const result = this.inputSchema.safeParse(input);
    if (result.success) {
      return { valid: true };
    }
    return { valid: false, error: result.error.message };
  }

  abstract generate(input: TInput): Promise<ToolOutput>;
}
