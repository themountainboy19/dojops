import { describe, it, expect, vi, beforeEach } from "vitest";
import * as child_process from "node:child_process";
import * as fs from "node:fs";

vi.mock("node:child_process");
vi.mock("node:fs");

const mockExecFileSync = vi.mocked(child_process.execFileSync);
const mockExistsSync = vi.mocked(fs.existsSync);

beforeEach(() => {
  vi.resetAllMocks();
  mockExistsSync.mockReturnValue(false);
});

// ── npm ────────────────────────────────────────────────────────────

describe("scanNpm", () => {
  it("skips when package-lock.json not found", async () => {
    const { scanNpm } = await import("./npm");
    mockExistsSync.mockReturnValue(false);
    const result = await scanNpm("/project");
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain("No package-lock.json");
  });

  it("skips when npm not found (ENOENT)", async () => {
    const { scanNpm } = await import("./npm");
    mockExistsSync.mockReturnValue(true);
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    mockExecFileSync.mockImplementation(() => {
      throw err;
    });
    const result = await scanNpm("/project");
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("npm not found");
  });

  it("parses npm audit JSON output", async () => {
    const { scanNpm } = await import("./npm");
    mockExistsSync.mockReturnValue(true);
    mockExecFileSync.mockReturnValue(
      JSON.stringify({
        vulnerabilities: {
          lodash: {
            severity: "high",
            via: [{ title: "Prototype Pollution" }],
            fixAvailable: { name: "lodash", version: "4.17.21" },
          },
          express: {
            severity: "moderate",
            via: ["qs"],
            fixAvailable: true,
          },
        },
      }),
    );

    const result = await scanNpm("/project");
    expect(result.skipped).toBeUndefined();
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0].severity).toBe("HIGH");
    expect(result.findings[0].category).toBe("DEPENDENCY");
    expect(result.findings[0].tool).toBe("npm-audit");
    expect(result.findings[1].severity).toBe("MEDIUM");
  });

  it("handles npm audit non-zero exit with JSON stdout", async () => {
    const { scanNpm } = await import("./npm");
    mockExistsSync.mockReturnValue(true);
    const err = Object.assign(new Error("exit 1"), {
      stdout: JSON.stringify({
        vulnerabilities: {
          pkg: {
            severity: "critical",
            via: ["CVE-2024-0001"],
            fixAvailable: false,
          },
        },
      }),
      stderr: "",
      status: 1,
    });
    mockExecFileSync.mockImplementation(() => {
      throw err;
    });

    const result = await scanNpm("/project");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe("CRITICAL");
  });
});

// ── pip ────────────────────────────────────────────────────────────

describe("scanPip", () => {
  it("skips when no Python files found", async () => {
    const { scanPip } = await import("./pip");
    mockExistsSync.mockReturnValue(false);
    const result = await scanPip("/project");
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain("No Python dependency file");
  });

  it("skips when pip-audit not found (ENOENT)", async () => {
    const { scanPip } = await import("./pip");
    mockExistsSync.mockImplementation((p) => {
      return String(p).includes("requirements.txt");
    });
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    mockExecFileSync.mockImplementation(() => {
      throw err;
    });
    const result = await scanPip("/project");
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("pip-audit not found");
  });

  it("parses pip-audit JSON output", async () => {
    const { scanPip } = await import("./pip");
    mockExistsSync.mockImplementation((p) => {
      return String(p).includes("requirements.txt");
    });
    mockExecFileSync.mockReturnValue(
      JSON.stringify([
        {
          name: "django",
          version: "3.2.0",
          id: "CVE-2024-0001",
          fix_versions: ["3.2.25"],
          description: "SQL injection vulnerability",
        },
      ]),
    );

    const result = await scanPip("/project");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe("HIGH");
    expect(result.findings[0].category).toBe("DEPENDENCY");
    expect(result.findings[0].autoFixAvailable).toBe(true);
  });
});

// ── trivy ──────────────────────────────────────────────────────────

describe("scanTrivy", () => {
  it("skips when trivy not found (ENOENT)", async () => {
    const { scanTrivy } = await import("./trivy");
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    mockExecFileSync.mockImplementation(() => {
      throw err;
    });
    const result = await scanTrivy("/project");
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("trivy not found");
  });

  it("parses trivy JSON with vulnerabilities and misconfigurations", async () => {
    const { scanTrivy } = await import("./trivy");
    mockExecFileSync.mockReturnValue(
      JSON.stringify({
        Results: [
          {
            Target: "package-lock.json",
            Vulnerabilities: [
              {
                VulnerabilityID: "CVE-2024-0001",
                PkgName: "lodash",
                InstalledVersion: "4.17.15",
                FixedVersion: "4.17.21",
                Severity: "HIGH",
                Title: "Prototype Pollution",
              },
            ],
          },
          {
            Target: "Dockerfile",
            Misconfigurations: [
              {
                ID: "DS001",
                Title: "Running as root",
                Description: "Container runs as root user",
                Severity: "MEDIUM",
                Resolution: "Add USER instruction",
              },
            ],
          },
          {
            Target: ".env",
            Secrets: [
              {
                RuleID: "aws-access-key-id",
                Title: "AWS Access Key",
                Severity: "CRITICAL",
                Match: "AKIA...",
                StartLine: 5,
              },
            ],
          },
        ],
      }),
    );

    const result = await scanTrivy("/project");
    expect(result.findings).toHaveLength(3);
    expect(result.findings[0].category).toBe("SECURITY");
    expect(result.findings[0].severity).toBe("HIGH");
    expect(result.findings[1].category).toBe("IAC");
    expect(result.findings[1].severity).toBe("MEDIUM");
    expect(result.findings[2].category).toBe("SECRETS");
    expect(result.findings[2].severity).toBe("CRITICAL");
  });
});

// ── checkov ────────────────────────────────────────────────────────

describe("scanCheckov", () => {
  it("skips when checkov not found (ENOENT)", async () => {
    const { scanCheckov } = await import("./checkov");
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    mockExecFileSync.mockImplementation(() => {
      throw err;
    });
    const result = await scanCheckov("/project");
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("checkov not found");
  });

  it("parses checkov JSON with failed checks", async () => {
    const { scanCheckov } = await import("./checkov");
    mockExecFileSync.mockReturnValue(
      JSON.stringify({
        results: {
          failed_checks: [
            {
              check_id: "CKV_AWS_21",
              check_result: { result: "FAILED" },
              file_path: "/main.tf",
              file_line_range: [10, 15],
              resource: "aws_s3_bucket.data",
              guideline: "Enable versioning on S3 bucket",
              severity: "HIGH",
            },
          ],
        },
      }),
    );

    const result = await scanCheckov("/project");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].category).toBe("IAC");
    expect(result.findings[0].severity).toBe("HIGH");
    expect(result.findings[0].file).toBe("/main.tf");
  });

  it("handles array output (multiple frameworks)", async () => {
    const { scanCheckov } = await import("./checkov");
    mockExecFileSync.mockReturnValue(
      JSON.stringify([
        {
          results: {
            failed_checks: [
              {
                check_id: "CKV_DOCKER_2",
                check_result: { result: "FAILED" },
                file_path: "/Dockerfile",
                file_line_range: [1, 1],
                resource: "Dockerfile",
                guideline: "Add HEALTHCHECK instruction",
              },
            ],
          },
        },
        {
          results: {
            failed_checks: [
              {
                check_id: "CKV_K8S_1",
                check_result: { result: "FAILED" },
                file_path: "/deployment.yaml",
                file_line_range: [5, 20],
                resource: "Deployment.default.app",
              },
            ],
          },
        },
      ]),
    );

    const result = await scanCheckov("/project");
    expect(result.findings).toHaveLength(2);
  });
});

// ── hadolint ───────────────────────────────────────────────────────

describe("scanHadolint", () => {
  it("skips when no Dockerfile found", async () => {
    const { scanHadolint } = await import("./hadolint");
    mockExistsSync.mockReturnValue(false);
    const result = await scanHadolint("/project");
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain("No Dockerfile");
  });

  it("skips when hadolint not found (ENOENT)", async () => {
    const { scanHadolint } = await import("./hadolint");
    mockExistsSync.mockImplementation((p) => {
      return String(p).endsWith("Dockerfile");
    });
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    mockExecFileSync.mockImplementation(() => {
      throw err;
    });
    const result = await scanHadolint("/project");
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("hadolint not found");
  });

  it("parses hadolint JSON output", async () => {
    const { scanHadolint } = await import("./hadolint");
    mockExistsSync.mockImplementation((p) => {
      return String(p).endsWith("Dockerfile");
    });
    mockExecFileSync.mockReturnValue(
      JSON.stringify([
        {
          line: 3,
          code: "DL3008",
          message: "Pin versions in apt-get install",
          column: 1,
          file: "/project/Dockerfile",
          level: "warning",
        },
        {
          line: 7,
          code: "DL3003",
          message: "Use WORKDIR instead of RUN cd",
          column: 1,
          file: "/project/Dockerfile",
          level: "error",
        },
      ]),
    );

    const result = await scanHadolint("/project");
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0].severity).toBe("MEDIUM");
    expect(result.findings[0].category).toBe("SECURITY");
    expect(result.findings[1].severity).toBe("HIGH");
  });
});

// ── gitleaks ───────────────────────────────────────────────────────

describe("scanGitleaks", () => {
  it("skips when gitleaks not found (ENOENT)", async () => {
    const { scanGitleaks } = await import("./gitleaks");
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    mockExecFileSync.mockImplementation(() => {
      throw err;
    });
    const result = await scanGitleaks("/project");
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("gitleaks not found");
  });

  it("parses gitleaks JSON array output", async () => {
    const { scanGitleaks } = await import("./gitleaks");
    mockExecFileSync.mockReturnValue(
      JSON.stringify([
        {
          RuleID: "aws-access-key-id",
          Description: "AWS Access Key ID",
          File: "config.js",
          StartLine: 12,
          EndLine: 12,
          Secret: "AKIA...",
        },
        {
          RuleID: "generic-api-key",
          Description: "Generic API Key",
          File: ".env",
          StartLine: 3,
          EndLine: 3,
          Secret: "sk-...",
        },
      ]),
    );

    const result = await scanGitleaks("/project");
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0].severity).toBe("CRITICAL");
    expect(result.findings[0].category).toBe("SECRETS");
    expect(result.findings[1].file).toBe(".env");
  });

  it("returns empty findings on clean scan (exit 0, empty output)", async () => {
    const { scanGitleaks } = await import("./gitleaks");
    mockExecFileSync.mockReturnValue("");
    const result = await scanGitleaks("/project");
    expect(result.findings).toHaveLength(0);
    expect(result.skipped).toBeUndefined();
  });
});
