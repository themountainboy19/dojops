import { describe, it, expect } from "vitest";
import { parseDopsString, validateDopsModule } from "../parser";

/** Build a .dops v1 string with customizable frontmatter and markdown sections. */
function makeDops(opts?: {
  meta?: Record<string, unknown>;
  frontmatter?: string;
  sections?: string;
}): string {
  const meta = opts?.meta
    ? Object.entries(opts.meta)
        .map(([k, v]) => `  ${k}: ${typeof v === "string" ? `"${v}"` : v}`)
        .join("\n")
    : '  name: test-tool\n  version: 1.0.0\n  description: "A test tool"';
  const extra =
    opts?.frontmatter ?? 'output:\n  type: object\nfiles:\n  - path: "out.yaml"\n    format: yaml';
  const sections = opts?.sections ?? "## Prompt\n\nGenerate.\n\n## Keywords\n\ntest";
  return `---\ndops: v1\nkind: tool\nmeta:\n${meta}\n${extra}\n---\n${sections}\n`;
}

const MINIMAL_DOPS = `---
dops: v1
kind: tool
meta:
  name: test-tool
  version: 1.0.0
  description: "A test tool"
output:
  type: object
  properties:
    result:
      type: string
files:
  - path: "output.yaml"
    format: yaml
---
# Test Tool

## Prompt

You are a test tool. Generate config.

## Keywords

test, tool
`;

describe("parseDopsString", () => {
  it("parses a valid .dops file", () => {
    const module = parseDopsString(MINIMAL_DOPS);
    expect(module.frontmatter.dops).toBe("v1");
    expect(module.frontmatter.meta.name).toBe("test-tool");
    expect(module.frontmatter.meta.version).toBe("1.0.0");
    expect(module.frontmatter.meta.description).toBe("A test tool");
    expect(module.frontmatter.files).toHaveLength(1);
    expect(module.frontmatter.files[0].format).toBe("yaml");
    expect(module.sections.prompt).toContain("You are a test tool");
    expect(module.sections.keywords).toContain("test, tool");
    expect(module.raw).toBe(MINIMAL_DOPS);
  });

  it("parses input fields", () => {
    const dops = `---
dops: v1
meta:
  name: with-input
  version: 1.0.0
  description: "Tool with input"
input:
  fields:
    name:
      type: string
      required: true
    count:
      type: integer
      default: 5
output:
  type: object
files:
  - path: "out.json"
    format: json
---
## Prompt

Generate.

## Keywords

test
`;
    const module = parseDopsString(dops);
    expect(module.frontmatter.input).toBeDefined();
    expect(module.frontmatter.input!.fields["name"]).toBeDefined();
    expect(module.frontmatter.input!.fields["name"].type).toBe("string");
    expect(module.frontmatter.input!.fields["count"].default).toBe(5);
  });

  it("parses all markdown sections", () => {
    const dops = `---
dops: v1
meta:
  name: full-sections
  version: 1.0.0
  description: "Tool with all sections"
output:
  type: object
files:
  - path: "out.yaml"
---
## Prompt

Main prompt text.

## Update Prompt

Update prompt text.

## Examples

Example content here.

## Constraints

- Rule 1
- Rule 2

## Keywords

a, b, c
`;
    const module = parseDopsString(dops);
    expect(module.sections.prompt).toBe("Main prompt text.");
    expect(module.sections.updatePrompt).toBe("Update prompt text.");
    expect(module.sections.examples).toBe("Example content here.");
    expect(module.sections.constraints).toContain("Rule 1");
    expect(module.sections.keywords).toBe("a, b, c");
  });

  it("throws on missing frontmatter delimiter", () => {
    expect(() => parseDopsString("no frontmatter here")).toThrow(
      "DOPS file must start with --- frontmatter delimiter",
    );
  });

  it("throws on missing closing delimiter", () => {
    expect(() => parseDopsString("---\ndops: v1\n")).toThrow(
      "DOPS file missing closing --- frontmatter delimiter",
    );
  });

  it("throws on invalid YAML frontmatter", () => {
    expect(() => parseDopsString("---\n: invalid: yaml:\n---\n")).toThrow(
      "Invalid YAML in frontmatter",
    );
  });

  it("throws on invalid frontmatter schema", () => {
    expect(() =>
      parseDopsString("---\ndops: v2\nmeta:\n  name: x\n---\n## Prompt\ntest\n## Keywords\ntest"),
    ).toThrow("Invalid DOPS frontmatter");
  });

  it("parses verification config", () => {
    const dops = `---
dops: v1
meta:
  name: verified
  version: 1.0.0
  description: "Tool with verification"
output:
  type: object
files:
  - path: "out.tf"
    format: hcl
verification:
  structural:
    - path: "resources"
      type: array
      minItems: 1
      message: "Need resources"
  binary:
    command: "terraform validate -json"
    parser: terraform-json
    timeout: 30000
permissions:
  child_process: required
---
## Prompt

Generate.

## Keywords

test
`;
    const module = parseDopsString(dops);
    expect(module.frontmatter.verification).toBeDefined();
    expect(module.frontmatter.verification!.structural).toHaveLength(1);
    expect(module.frontmatter.verification!.binary).toBeDefined();
    expect(module.frontmatter.verification!.binary!.parser).toBe("terraform-json");
    expect(module.frontmatter.permissions!.child_process).toBe("required");
  });
});

describe("validateDopsModule", () => {
  it("validates a complete module", () => {
    const module = parseDopsString(MINIMAL_DOPS);
    const result = validateDopsModule(module);
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it("catches missing ## Prompt", () => {
    const module = parseDopsString(
      makeDops({
        meta: { name: "no-prompt", version: "1.0.0", description: "No prompt" },
        sections: "## Keywords\n\ntest",
      }),
    );
    const result = validateDopsModule(module);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing required ## Prompt section");
  });

  it("catches missing ## Keywords", () => {
    const module = parseDopsString(
      makeDops({
        meta: { name: "no-keywords", version: "1.0.0", description: "No keywords" },
        sections: "## Prompt\n\nSome prompt.",
      }),
    );
    const result = validateDopsModule(module);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing required ## Keywords section");
  });

  it("catches unknown verification parser", () => {
    const module = parseDopsString(
      makeDops({
        meta: { name: "bad-parser", version: "1.0.0", description: "Bad parser" },
        frontmatter:
          'output:\n  type: object\nfiles:\n  - path: "out.yaml"\nverification:\n  binary:\n    command: "unknown-tool"\n    parser: unknown-parser',
      }),
    );
    const result = validateDopsModule(module);
    expect(result.valid).toBe(false);
    expect(result.errors![0]).toContain("Unknown verification parser");
  });

  it("catches scope write path with path traversal", () => {
    const module = parseDopsString(
      makeDops({
        meta: { name: "bad-scope", version: "1.0.0", description: "Bad scope" },
        frontmatter:
          'output:\n  type: object\nfiles:\n  - path: "out.yaml"\nscope:\n  write: ["../etc/passwd"]',
      }),
    );
    const result = validateDopsModule(module);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Scope write path contains path traversal: '../etc/passwd'");
  });

  it("catches network required with risk declared", () => {
    const module = parseDopsString(
      makeDops({
        meta: { name: "net-risk", version: "1.0.0", description: "Net risk" },
        frontmatter:
          'output:\n  type: object\nfiles:\n  - path: "out.yaml"\nrisk:\n  level: LOW\n  rationale: "Test tool"\npermissions:\n  network: required',
      }),
    );
    const result = validateDopsModule(module);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("network permission must be 'none' for v1 tools");
  });

  it("parses scope, risk, execution, update sections", () => {
    const dops = `---
dops: v1
meta:
  name: full-sections
  version: 1.0.0
  description: "Tool with all new sections"
output:
  type: object
files:
  - path: "{outputPath}/out.yaml"
scope:
  write: ["{outputPath}/out.yaml"]
risk:
  level: MEDIUM
  rationale: "Infra changes"
execution:
  mode: generate
  deterministic: true
  idempotent: true
update:
  strategy: preserve_structure
  inputSource: file
  injectAs: existingConfig
---
## Prompt

Prompt.

## Keywords

test
`;
    const module = parseDopsString(dops);
    expect(module.frontmatter.scope).toBeDefined();
    expect(module.frontmatter.scope!.write).toEqual(["{outputPath}/out.yaml"]);
    expect(module.frontmatter.risk).toBeDefined();
    expect(module.frontmatter.risk!.level).toBe("MEDIUM");
    expect(module.frontmatter.risk!.rationale).toBe("Infra changes");
    expect(module.frontmatter.execution).toBeDefined();
    expect(module.frontmatter.execution!.mode).toBe("generate");
    expect(module.frontmatter.execution!.deterministic).toBe(true);
    expect(module.frontmatter.execution!.idempotent).toBe(true);
    expect(module.frontmatter.update).toBeDefined();
    expect(module.frontmatter.update!.strategy).toBe("preserve_structure");
    expect(module.frontmatter.update!.injectAs).toBe("existingConfig");
  });

  it("backward compat: minimal dops still validates without new fields", () => {
    const module = parseDopsString(MINIMAL_DOPS);
    const result = validateDopsModule(module);
    expect(result.valid).toBe(true);
    expect(module.frontmatter.scope).toBeUndefined();
    expect(module.frontmatter.risk).toBeUndefined();
    expect(module.frontmatter.execution).toBeUndefined();
    expect(module.frontmatter.update).toBeUndefined();
  });

  it("parses meta.icon as HTTPS URL", () => {
    const module = parseDopsString(
      makeDops({
        meta: { name: "icon-tool", version: "1.0.0", description: "Tool with icon" },
        frontmatter:
          '  icon: "https://registry.dojops.ai/icons/terraform.svg"\noutput:\n  type: object\nfiles:\n  - path: "out.yaml"',
      }),
    );
    expect(module.frontmatter.meta.icon).toBe("https://registry.dojops.ai/icons/terraform.svg");
  });

  it("rejects non-HTTPS icon URL", () => {
    expect(() =>
      parseDopsString(
        makeDops({
          meta: { name: "bad-icon", version: "1.0.0", description: "Bad icon" },
          frontmatter:
            '  icon: "http://example.com/icon.png"\noutput:\n  type: object\nfiles:\n  - path: "out.yaml"',
        }),
      ),
    ).toThrow("Invalid DOPS frontmatter");
  });

  it("meta.icon is optional", () => {
    const module = parseDopsString(MINIMAL_DOPS);
    expect(module.frontmatter.meta.icon).toBeUndefined();
  });
});
