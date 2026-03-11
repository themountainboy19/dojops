import { ContextBlock, DopsUpdate, MarkdownSections } from "./spec";

export interface PromptContextV2 {
  existingContent?: string;
  updateConfig?: DopsUpdate;
  context7Docs?: string;
  projectContext?: string;
  contextBlock: ContextBlock;
}

// Note: compilePromptV2 intentionally ignores sections.updatePrompt,
// sections.constraints, and sections.examples — these are v1-only features.
// v2 uses context.bestPractices for constraints, Context7 for examples,
// and the generic update fallback for update mode.

/**
 * Compile markdown sections into an optimized LLM system prompt for v2 modules.
 *
 * v2 only uses ## Prompt + ## Keywords from markdown sections.
 * Constraints belong in context.bestPractices, examples are replaced by Context7 docs,
 * and update mode always uses the generic fallback.
 *
 * Supports v2-specific variables:
 * - {outputGuidance} — from context.outputGuidance
 * - {bestPractices} — numbered list from context.bestPractices
 * - {context7Docs} — fetched docs injected at runtime
 * - {projectContext} — repo scanner context string
 * - {existingContent} — same as v1 (for update mode)
 */
export function compilePromptV2(sections: MarkdownSections, context: PromptContextV2): string {
  const parts: string[] = [];

  // Main prompt section — always use ## Prompt with generic update fallback
  const isUpdate = !!context.existingContent;

  if (isUpdate) {
    let prompt = substituteV2Variables(sections.prompt, context);
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
    parts.push(substituteV2Variables(sections.prompt, context));
  }

  return parts.join("\n");
}

/**
 * Substitute v2-specific `{variableName}` placeholders in a prompt string.
 */
function substituteV2Variables(prompt: string, context: PromptContextV2): string {
  let result = prompt;

  // Substitute outputGuidance placeholder
  result = result.replaceAll("{outputGuidance}", context.contextBlock.outputGuidance);

  // Substitute bestPractices placeholder with numbered list
  const bestPracticesList = context.contextBlock.bestPractices
    .map((bp, i) => `${i + 1}. ${bp}`)
    .join("\n");
  result = result.replaceAll("{bestPractices}", bestPracticesList);

  // Substitute context7Docs placeholder
  if (context.context7Docs === undefined) {
    result = result.replaceAll("{context7Docs}", "No additional documentation available.");
  } else {
    result = result.replaceAll("{context7Docs}", context.context7Docs);
  }

  // Substitute projectContext placeholder
  if (context.projectContext === undefined) {
    result = result.replaceAll("{projectContext}", "No project context available.");
  } else {
    result = result.replaceAll("{projectContext}", context.projectContext);
  }

  // {existingContent} — trusted (read from filesystem)
  if (context.existingContent !== undefined) {
    const injectAs = context.updateConfig?.injectAs ?? "existingContent";
    result = result.replaceAll(`{${injectAs}}`, context.existingContent);
    if (injectAs !== "existingContent") {
      result = result.replaceAll("{existingContent}", context.existingContent);
    }
  }

  return result;
}
