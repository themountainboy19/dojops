import readline from "node:readline";

export interface PromptInputOptions {
  mask?: boolean;
  default?: string;
}

function createInterface(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): readline.Interface {
  return readline.createInterface({ input, output });
}

/**
 * Displays numbered choices, reads selection, returns chosen value.
 *
 * Example:
 *   ? Select your LLM provider:
 *     1) openai
 *     2) anthropic
 *     3) ollama
 *   > 2
 */
export async function promptSelect(
  question: string,
  choices: readonly string[],
  rl?: readline.Interface,
): Promise<string> {
  const owned = !rl;
  if (!rl) rl = createInterface();

  const lines = [`? ${question}`];
  for (let i = 0; i < choices.length; i++) {
    lines.push(`  ${i + 1}) ${choices[i]}`);
  }

  return new Promise<string>((resolve, reject) => {
    rl!.write(lines.join("\n") + "\n");
    rl!.question("> ", (answer) => {
      if (owned) rl!.close();

      const num = parseInt(answer.trim(), 10);
      if (isNaN(num) || num < 1 || num > choices.length) {
        reject(new Error(`Invalid selection: "${answer.trim()}". Enter 1-${choices.length}.`));
        return;
      }
      resolve(choices[num - 1]);
    });
  });
}

/**
 * Reads a line of text. Supports { mask: true } to hide input (on TTYs)
 * and { default: string } for default values.
 */
export async function promptInput(
  question: string,
  options?: PromptInputOptions,
  rl?: readline.Interface,
): Promise<string> {
  const owned = !rl;
  if (!rl) rl = createInterface();

  const defaultHint = options?.default ? ` (${options.default})` : "";
  const prompt = `? ${question}${defaultHint}: `;

  if (options?.mask && !rl) {
    // For real TTY masked input, use raw mode on process.stdin directly
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (typeof stdin.setRawMode === "function") {
      stdout.write(prompt);
      stdin.setRawMode(true);
      stdin.resume();

      return new Promise<string>((resolve) => {
        let value = "";
        const onData = (buf: Buffer) => {
          const c = buf.toString("utf-8");
          if (c === "\n" || c === "\r") {
            stdin.setRawMode!(false);
            stdin.removeListener("data", onData);
            stdin.pause();
            stdout.write("\n");
            resolve(value || options?.default || "");
          } else if (c === "\u007F" || c === "\b") {
            if (value.length > 0) {
              value = value.slice(0, -1);
              stdout.write("\b \b");
            }
          } else if (c === "\u0003") {
            stdin.setRawMode!(false);
            process.exit(1);
          } else {
            value += c;
            stdout.write("*");
          }
        };
        stdin.on("data", onData);
      });
    }
  }

  // Standard question (also used as mask fallback for non-TTY / injected rl)
  return new Promise<string>((resolve) => {
    rl!.question(prompt, (answer) => {
      if (owned) rl!.close();
      resolve(answer.trim() || options?.default || "");
    });
  });
}

/**
 * Yes/no prompt. Returns boolean.
 */
export async function promptConfirm(question: string, rl?: readline.Interface): Promise<boolean> {
  const owned = !rl;
  if (!rl) rl = createInterface();

  return new Promise<boolean>((resolve) => {
    rl!.question(`? ${question} (y/N): `, (answer) => {
      if (owned) rl!.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}
