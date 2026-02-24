import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { LLMProvider } from "@dojops/core";
import { GitHubActionsTool } from "./github-actions-tool";
import { Workflow } from "./schemas";

const mockWorkflow: Workflow = {
  name: "CI",
  on: { push: { branches: ["main"] } },
  jobs: {
    build: {
      "runs-on": "ubuntu-latest",
      steps: [
        { name: "Checkout", uses: "actions/checkout@v4" },
        { name: "Setup Node", uses: "actions/setup-node@v4", with: { "node-version": "20" } },
        { name: "Install", run: "npm ci" },
        { name: "Test", run: "npm test" },
      ],
    },
  },
};

function createMockProvider(): LLMProvider {
  return {
    name: "mock",
    generate: vi.fn().mockResolvedValue({
      content: JSON.stringify(mockWorkflow),
      parsed: mockWorkflow,
    }),
  };
}

describe("GitHubActionsTool", () => {
  let tmpDir: string;

  function makeTmpDir(): string {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dojops-gh-tool-"));
    return tmpDir;
  }

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("validates correct input", () => {
    const tool = new GitHubActionsTool(createMockProvider());
    const result = tool.validate({ projectPath: "/some/path" });
    expect(result.valid).toBe(true);
  });

  it("rejects input without projectPath", () => {
    const tool = new GitHubActionsTool(createMockProvider());
    const result = tool.validate({});
    expect(result.valid).toBe(false);
  });

  it("returns error for unknown project type", async () => {
    const dir = makeTmpDir();
    const tool = new GitHubActionsTool(createMockProvider());
    const result = await tool.generate({
      projectPath: dir,
      nodeVersion: "20",
      defaultBranch: "main",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Could not detect project type");
  });

  it("generates workflow YAML for a Node.js project", async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "package.json"), "{}");
    const tool = new GitHubActionsTool(createMockProvider());
    const result = await tool.generate({
      projectPath: dir,
      nodeVersion: "20",
      defaultBranch: "main",
    });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty("yaml");
    expect(result.data).toHaveProperty("projectType");
  });

  it("writes workflow file to disk on execute", async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "package.json"), "{}");
    const tool = new GitHubActionsTool(createMockProvider());
    await tool.execute({ projectPath: dir, nodeVersion: "20", defaultBranch: "main" });
    const ciPath = path.join(dir, ".github", "workflows", "ci.yml");
    expect(fs.existsSync(ciPath)).toBe(true);
    const content = fs.readFileSync(ciPath, "utf-8");
    expect(content).toContain("CI");
  });

  it("auto-detects existing workflow file", async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "package.json"), "{}");
    const wfDir = path.join(dir, ".github", "workflows");
    fs.mkdirSync(wfDir, { recursive: true });
    fs.writeFileSync(path.join(wfDir, "ci.yml"), "name: ExistingCI\non: push", "utf-8");

    const provider = createMockProvider();
    const tool = new GitHubActionsTool(provider);
    const result = await tool.generate({
      projectPath: dir,
      nodeVersion: "20",
      defaultBranch: "main",
    });

    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).isUpdate).toBe(true);
    const call = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.prompt).toContain("ExistingCI");
  });

  it("uses explicit existingContent over auto-detection", async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "package.json"), "{}");

    const provider = createMockProvider();
    const tool = new GitHubActionsTool(provider);
    const result = await tool.generate({
      projectPath: dir,
      nodeVersion: "20",
      defaultBranch: "main",
      existingContent: "name: PassedContent\non: push",
    });

    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).isUpdate).toBe(true);
    const call = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.prompt).toContain("PassedContent");
  });

  it("creates backup before overwriting on execute", async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "package.json"), "{}");
    const wfDir = path.join(dir, ".github", "workflows");
    fs.mkdirSync(wfDir, { recursive: true });
    fs.writeFileSync(path.join(wfDir, "ci.yml"), "name: OldCI", "utf-8");

    const tool = new GitHubActionsTool(createMockProvider());
    await tool.execute({ projectPath: dir, nodeVersion: "20", defaultBranch: "main" });

    expect(fs.existsSync(path.join(wfDir, "ci.yml.bak"))).toBe(true);
    expect(fs.readFileSync(path.join(wfDir, "ci.yml.bak"), "utf-8")).toBe("name: OldCI");
  });

  it("does not create backup for new files", async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "package.json"), "{}");

    const tool = new GitHubActionsTool(createMockProvider());
    await tool.execute({ projectPath: dir, nodeVersion: "20", defaultBranch: "main" });

    const wfDir = path.join(dir, ".github", "workflows");
    expect(fs.existsSync(path.join(wfDir, "ci.yml.bak"))).toBe(false);
  });
});
