import { DopsUpdate, MarkdownSections } from "./spec";

export interface PromptContext {
  existingContent?: string;
  input?: Record<string, unknown>;
  updateConfig?: DopsUpdate;
}

/**
 * Compile markdown sections into an optimized LLM system prompt.
 *
 * In update mode (existingContent present), uses ## Update Prompt if available,
 * otherwise falls back to ## Prompt with a generic update suffix.
 *
 * Appends ## Constraints as numbered rules and ## Examples as structured examples.
 */
export function compilePrompt(sections: MarkdownSections, context: PromptContext): string {
  const parts: string[] = [];

  // 1. Main prompt section
  const isUpdate = !!context.existingContent;

  if (isUpdate && sections.updatePrompt) {
    let prompt = sections.updatePrompt;
    prompt = substituteVariables(prompt, context);
    // Add preserve_structure instruction if configured
    if (context.updateConfig?.strategy === "preserve_structure") {
      prompt +=
        "\n\nIMPORTANT: Preserve the overall structure and organization of the existing configuration.";
    }
    parts.push(prompt);
  } else if (isUpdate) {
    // Fallback: use Prompt section + generic update suffix
    let prompt = substituteVariables(sections.prompt, context);
    const preserveInstruction =
      context.updateConfig?.strategy === "preserve_structure"
        ? "Preserve the overall structure and organization of the existing configuration.\n"
        : "";
    prompt +=
      "\n\nYou are UPDATING an existing configuration.\n" +
      preserveInstruction +
      "Preserve ALL existing content unless explicitly asked to remove it.\n" +
      "Merge new content with existing.\n\n" +
      "--- EXISTING CONFIGURATION ---\n" +
      (context.existingContent ?? "") +
      "\n--- END EXISTING CONFIGURATION ---";
    parts.push(prompt);
  } else {
    parts.push(substituteVariables(sections.prompt, context));
  }

  // 2. Constraints section
  if (sections.constraints) {
    const constraintLines = sections.constraints
      .split("\n")
      .map((line) => line.replace(/^[-*]\s*/, "").trim())
      .filter((line) => line.length > 0);

    if (constraintLines.length > 0) {
      parts.push("\nCONSTRAINTS:");
      constraintLines.forEach((line, i) => {
        parts.push(`${i + 1}. ${line}`);
      });
    }
  }

  // 3. Examples section
  if (sections.examples) {
    parts.push("\nEXAMPLES:");
    parts.push(sections.examples);
  }

  return parts.join("\n");
}

/**
 * Substitute `{variableName}` placeholders in a prompt string
 * with values from the context.
 */
function substituteVariables(prompt: string, context: PromptContext): string {
  let result = prompt;

  // Substitute existing content under the configured variable name
  if (context.existingContent !== undefined) {
    const injectAs = context.updateConfig?.injectAs ?? "existingContent";
    result = result.replace(new RegExp(`\\{${injectAs}\\}`, "g"), context.existingContent);
    // Always substitute {existingContent} as fallback if injectAs differs
    if (injectAs !== "existingContent") {
      result = result.replace(/\{existingContent\}/g, context.existingContent);
    }
  }

  // Substitute {key} from input values
  if (context.input) {
    for (const [key, value] of Object.entries(context.input)) {
      if (typeof value === "string") {
        result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
      }
    }
  }

  return result;
}
