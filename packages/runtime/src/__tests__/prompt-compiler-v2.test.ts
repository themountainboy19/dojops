import { describe, it, expect } from "vitest";
import { compilePromptV2, PromptContextV2 } from "../prompt-compiler";
import { ContextBlock, MarkdownSections } from "../spec";

const baseContext: ContextBlock = {
  technology: "Terraform",
  fileFormat: "hcl",
  outputGuidance: "Generate valid HCL code with proper resource blocks.",
  bestPractices: [
    "Use modules for reusable components",
    "Tag all resources with project and environment",
    "Use variables for configurable values",
  ],
};

const baseSections: MarkdownSections = {
  prompt:
    "You are a Terraform expert.\n\nGuidance: {outputGuidance}\n\nBest practices:\n{bestPractices}",
  keywords: "terraform, hcl",
};

function makeContext(overrides?: Partial<PromptContextV2>): PromptContextV2 {
  return {
    contextBlock: baseContext,
    ...overrides,
  };
}

describe("compilePromptV2", () => {
  it("substitutes {outputGuidance} from context block", () => {
    const result = compilePromptV2(baseSections, makeContext());
    expect(result).toContain("Generate valid HCL code with proper resource blocks.");
    expect(result).not.toContain("{outputGuidance}");
  });

  it("substitutes {bestPractices} as numbered list", () => {
    const result = compilePromptV2(baseSections, makeContext());
    expect(result).toContain("1. Use modules for reusable components");
    expect(result).toContain("2. Tag all resources with project and environment");
    expect(result).toContain("3. Use variables for configurable values");
    expect(result).not.toContain("{bestPractices}");
  });

  it("substitutes {context7Docs} when provided", () => {
    const sections: MarkdownSections = {
      prompt: "Generate config.\n\nReference docs:\n{context7Docs}",
      keywords: "test",
    };
    const result = compilePromptV2(
      sections,
      makeContext({ context7Docs: "### Terraform\nUse `resource` blocks." }),
    );
    expect(result).toContain("### Terraform");
    expect(result).toContain("Use `resource` blocks.");
    expect(result).not.toContain("{context7Docs}");
  });

  it("replaces {context7Docs} with fallback when not provided", () => {
    const sections: MarkdownSections = {
      prompt: "Generate config.\n\nDocs: {context7Docs}",
      keywords: "test",
    };
    const result = compilePromptV2(sections, makeContext());
    expect(result).toContain("No additional documentation available.");
    expect(result).not.toContain("{context7Docs}");
  });

  it("substitutes {projectContext} when provided", () => {
    const sections: MarkdownSections = {
      prompt: "Generate config.\n\nProject info:\n{projectContext}",
      keywords: "test",
    };
    const result = compilePromptV2(
      sections,
      makeContext({ projectContext: "Node.js 20, Express, PostgreSQL" }),
    );
    expect(result).toContain("Node.js 20, Express, PostgreSQL");
    expect(result).not.toContain("{projectContext}");
  });

  it("replaces {projectContext} with fallback when not provided", () => {
    const sections: MarkdownSections = {
      prompt: "Generate config.\n\nContext: {projectContext}",
      keywords: "test",
    };
    const result = compilePromptV2(sections, makeContext());
    expect(result).toContain("No project context available.");
    expect(result).not.toContain("{projectContext}");
  });

  it("uses update prompt when existingContent is provided", () => {
    const sections: MarkdownSections = {
      prompt: "Generate new Terraform config.",
      updatePrompt: "Update existing config. Current: {existingContent}",
      keywords: "test",
    };
    const result = compilePromptV2(
      sections,
      makeContext({ existingContent: 'resource "aws_s3_bucket" {}' }),
    );
    expect(result).toContain("Update existing config.");
    expect(result).toContain('resource "aws_s3_bucket" {}');
    expect(result).not.toContain("Generate new Terraform config.");
  });

  it("falls back to prompt + generic update suffix when no update prompt", () => {
    const sections: MarkdownSections = {
      prompt: "You are a Terraform expert. {outputGuidance}",
      keywords: "test",
    };
    const result = compilePromptV2(
      sections,
      makeContext({ existingContent: "old config content" }),
    );
    expect(result).toContain("You are a Terraform expert.");
    expect(result).toContain("UPDATING an existing configuration");
    expect(result).toContain("old config content");
    expect(result).toContain("--- EXISTING CONFIGURATION ---");
  });

  it("substitutes {existingContent} in update prompt", () => {
    const sections: MarkdownSections = {
      prompt: "Generate config.",
      updatePrompt: "Merge with existing:\n{existingContent}\n\nApply changes.",
      keywords: "test",
    };
    const result = compilePromptV2(
      sections,
      makeContext({ existingContent: 'variable "name" {}' }),
    );
    expect(result).toContain('variable "name" {}');
    expect(result).toContain("Apply changes.");
  });

  it("handles missing optional variables gracefully", () => {
    const sections: MarkdownSections = {
      prompt:
        "Generate config.\n\nGuidance: {outputGuidance}\nPractices: {bestPractices}\nDocs: {context7Docs}\nProject: {projectContext}",
      keywords: "test",
    };
    // No context7Docs or projectContext
    const result = compilePromptV2(sections, makeContext());
    expect(result).toContain("Generate valid HCL code");
    expect(result).toContain("1. Use modules");
    expect(result).toContain("No additional documentation available.");
    expect(result).toContain("No project context available.");
    // No leftover placeholders
    expect(result).not.toContain("{outputGuidance}");
    expect(result).not.toContain("{bestPractices}");
    expect(result).not.toContain("{context7Docs}");
    expect(result).not.toContain("{projectContext}");
  });

  it("appends constraints as numbered list", () => {
    const sections: MarkdownSections = {
      prompt: "Generate config. {outputGuidance}",
      constraints: "- Use Terraform 1.5+ syntax\n- Include required providers block",
      keywords: "test",
    };
    const result = compilePromptV2(sections, makeContext());
    expect(result).toContain("CONSTRAINTS:");
    expect(result).toContain("1. Use Terraform 1.5+ syntax");
    expect(result).toContain("2. Include required providers block");
  });

  it("appends examples section", () => {
    const sections: MarkdownSections = {
      prompt: "Generate config. {outputGuidance}",
      examples: 'Given: "S3 bucket"\nOutput: resource "aws_s3_bucket" { ... }',
      keywords: "test",
    };
    const result = compilePromptV2(sections, makeContext());
    expect(result).toContain("EXAMPLES:");
    expect(result).toContain("S3 bucket");
  });

  it("adds preserve_structure instruction when configured in update mode", () => {
    const sections: MarkdownSections = {
      prompt: "Generate config. {outputGuidance}",
      updatePrompt: "Update config. {existingContent}",
      keywords: "test",
    };
    const result = compilePromptV2(
      sections,
      makeContext({
        existingContent: "old content",
        updateConfig: {
          strategy: "preserve_structure",
          inputSource: "file",
          injectAs: "existingContent",
        },
      }),
    );
    expect(result).toContain("Preserve the overall structure");
  });
});
