import { describe, it, expect, vi } from "vitest";
import readline from "node:readline";
import { promptSelect, promptInput, promptConfirm } from "./prompts";

function createMockRL(answer: string): readline.Interface {
  const rl = {
    question: vi.fn((_prompt: string, cb: (answer: string) => void) => {
      cb(answer);
    }),
    write: vi.fn(),
    close: vi.fn(),
    input: {},
    output: {},
  } as unknown as readline.Interface;
  return rl;
}

describe("prompts", () => {
  describe("promptSelect", () => {
    it("returns the chosen value for a valid selection", async () => {
      const rl = createMockRL("2");
      const result = await promptSelect("Pick one:", ["a", "b", "c"], rl);
      expect(result).toBe("b");
    });

    it("returns first choice for selection 1", async () => {
      const rl = createMockRL("1");
      const result = await promptSelect("Pick:", ["openai", "anthropic", "ollama"], rl);
      expect(result).toBe("openai");
    });

    it("returns last choice for max selection", async () => {
      const rl = createMockRL("3");
      const result = await promptSelect("Pick:", ["a", "b", "c"], rl);
      expect(result).toBe("c");
    });

    it("rejects for non-numeric input", async () => {
      const rl = createMockRL("abc");
      await expect(promptSelect("Pick:", ["a", "b"], rl)).rejects.toThrow(
        'Invalid selection: "abc"',
      );
    });

    it("rejects for out-of-range selection (0)", async () => {
      const rl = createMockRL("0");
      await expect(promptSelect("Pick:", ["a", "b"], rl)).rejects.toThrow('Invalid selection: "0"');
    });

    it("rejects for out-of-range selection (too high)", async () => {
      const rl = createMockRL("5");
      await expect(promptSelect("Pick:", ["a", "b"], rl)).rejects.toThrow('Invalid selection: "5"');
    });

    it("writes the question and choices", async () => {
      const rl = createMockRL("1");
      await promptSelect("Select provider:", ["openai", "anthropic"], rl);
      expect(rl.write).toHaveBeenCalledWith(expect.stringContaining("Select provider:"));
      expect(rl.write).toHaveBeenCalledWith(expect.stringContaining("1) openai"));
      expect(rl.write).toHaveBeenCalledWith(expect.stringContaining("2) anthropic"));
    });
  });

  describe("promptInput", () => {
    it("returns user input", async () => {
      const rl = createMockRL("my-value");
      const result = await promptInput("Enter value", undefined, rl);
      expect(result).toBe("my-value");
    });

    it("returns default when input is empty", async () => {
      const rl = createMockRL("");
      const result = await promptInput("Enter value", { default: "fallback" }, rl);
      expect(result).toBe("fallback");
    });

    it("trims whitespace from input", async () => {
      const rl = createMockRL("  trimmed  ");
      const result = await promptInput("Enter value", undefined, rl);
      expect(result).toBe("trimmed");
    });

    it("returns empty string when no default and empty input", async () => {
      const rl = createMockRL("");
      const result = await promptInput("Enter value", undefined, rl);
      expect(result).toBe("");
    });

    it("uses mask fallback in non-TTY mode (no setRawMode)", async () => {
      const questionFn = vi.fn((_prompt: string, cb: (answer: string) => void) => {
        cb("secret");
      });
      const rl = {
        question: questionFn,
        write: vi.fn(),
        close: vi.fn(),
        input: {},
        output: {},
      } as unknown as readline.Interface;

      const result = await promptInput("API Key", { mask: true }, rl);
      expect(result).toBe("secret");
    });
  });

  describe("promptConfirm", () => {
    it("returns true for 'y'", async () => {
      const rl = createMockRL("y");
      expect(await promptConfirm("Continue?", rl)).toBe(true);
    });

    it("returns true for 'Y'", async () => {
      const rl = createMockRL("Y");
      expect(await promptConfirm("Continue?", rl)).toBe(true);
    });

    it("returns false for 'n'", async () => {
      const rl = createMockRL("n");
      expect(await promptConfirm("Continue?", rl)).toBe(false);
    });

    it("returns false for empty input", async () => {
      const rl = createMockRL("");
      expect(await promptConfirm("Continue?", rl)).toBe(false);
    });

    it("returns false for arbitrary text", async () => {
      const rl = createMockRL("maybe");
      expect(await promptConfirm("Continue?", rl)).toBe(false);
    });
  });
});
