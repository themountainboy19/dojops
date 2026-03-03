# Security Scanning

DojOps's `@dojops/scanner` package provides automated security scanning with 10 scanners covering vulnerabilities, dependency audits, infrastructure-as-code checks, secret detection, shell script analysis, SAST, license compliance, and SBOM generation. Findings can be automatically remediated using LLM-powered fix generation.

---

## Overview

The scanner system:

1. Discovers project directories (supports monorepos)
2. Determines which scanners are applicable based on project files
3. Runs applicable scanners in parallel
4. Aggregates findings into a structured `ScanReport`
5. Optionally generates and applies LLM-powered remediation

---

## Scanners

| Scanner         | Binary       | Categories         | Applicability                                                                      |
| --------------- | ------------ | ------------------ | ---------------------------------------------------------------------------------- |
| `npm-audit`     | `npm`        | `deps`, `security` | Node.js projects (has `package-lock.json`)                                         |
| `pip-audit`     | `pip-audit`  | `deps`, `security` | Python projects (has `requirements.txt`, `Pipfile`, `setup.py`, `pyproject.toml`)  |
| `trivy`         | `trivy`      | `security`         | Always applicable (vulnerabilities, secrets, misconfigurations)                    |
| `gitleaks`      | `gitleaks`   | `security`         | Always applicable (hardcoded secrets and credentials)                              |
| `checkov`       | `checkov`    | `iac`, `security`  | Projects with Terraform, Kubernetes, Helm, Ansible, CloudFormation, or Dockerfiles |
| `hadolint`      | `hadolint`   | `iac`, `security`  | Projects that have a `Dockerfile`                                                  |
| `shellcheck`    | `shellcheck` | `iac`, `security`  | Projects with shell scripts (`.sh` files)                                          |
| `trivy-sbom`    | `trivy`      | `SBOM`             | Always applicable (generates CycloneDX SBOM)                                       |
| `trivy-license` | `trivy`      | `LICENSE`          | Always applicable (license compliance checking)                                    |
| `semgrep`       | `semgrep`    | `SECURITY`         | Always applicable (SAST — static application security testing)                     |

---

## Scan Types

| Type       | Scanners Run                  | Description                                    |
| ---------- | ----------------------------- | ---------------------------------------------- |
| `all`      | All applicable                | Full project scan (default)                    |
| `security` | trivy, gitleaks, semgrep      | Security vulnerabilities, secrets, and SAST    |
| `deps`     | npm-audit, pip-audit          | Dependency vulnerability audit                 |
| `iac`      | checkov, hadolint, shellcheck | Infrastructure-as-code linting and validation  |
| `sbom`     | trivy-sbom                    | SBOM generation (CycloneDX) with hash tracking |
| `license`  | trivy-license                 | License compliance checking                    |

---

## Severity Levels

| Level      | Description                                                     |
| ---------- | --------------------------------------------------------------- |
| `CRITICAL` | Immediate action required — known exploits, exposed credentials |
| `HIGH`     | Should be fixed soon — significant vulnerabilities              |
| `MEDIUM`   | Should be addressed — moderate risk                             |
| `LOW`      | Informational — minor issues or best practice violations        |

---

## Finding Categories

| Category     | Description                         | Scanners                                      |
| ------------ | ----------------------------------- | --------------------------------------------- |
| `SECURITY`   | Vulnerability findings              | trivy, hadolint, shellcheck, checkov, semgrep |
| `DEPENDENCY` | Outdated or vulnerable dependencies | npm-audit, pip-audit                          |
| `IAC`        | Infrastructure-as-code issues       | checkov, hadolint, shellcheck                 |
| `SECRETS`    | Hardcoded secrets and credentials   | gitleaks                                      |
| `LICENSE`    | License compliance issues           | trivy-license                                 |

---

## CLI Usage

### Full Scan

```bash
dojops scan
```

Runs all applicable scanners against the current project. Output includes:

- Scanner-by-scanner progress with spinners
- Summary table (critical/high/medium/low counts)
- Exit code 6 for HIGH findings, 7 for CRITICAL findings

### Targeted Scans

```bash
dojops scan --security       # trivy + gitleaks + semgrep + checkov + hadolint + shellcheck
dojops scan --deps           # npm-audit + pip-audit
dojops scan --iac            # checkov + hadolint + shellcheck
dojops scan --license        # trivy-license (license compliance)
```

### Scan Comparison

```bash
dojops scan --compare        # Compare findings with previous scan report
```

The `--compare` flag runs the scan and then compares the results against the most recent previous scan report. It shows:

- **New findings** — Issues that appeared since the last scan
- **Resolved findings** — Issues that were present in the previous scan but are now fixed

Finding comparison uses deterministic IDs (based on tool, rule, file, and line) to accurately track which findings are new vs resolved.

### Auto-Remediation

```bash
dojops scan --fix            # Generate fixes, prompt for approval
dojops scan --fix --yes      # Generate and apply fixes automatically
```

The `--fix` flag:

1. Runs the scan
2. Filters findings to HIGH and CRITICAL severity
3. Sends findings to the LLM for fix generation
4. Produces a `RemediationPlan` with specific file patches
5. Prompts for approval (or auto-applies with `--yes`)
6. Applies patches to the project files

---

## API Usage

### Run a Scan

```bash
curl -X POST http://localhost:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{"scanType": "all"}'
```

### Targeted Scan

```bash
curl -X POST http://localhost:3000/api/scan \
  -H "Content-Type: application/json" \
  -d '{"scanType": "security", "target": "/path/to/project"}'
```

---

## Scan Report Structure

```typescript
interface ScanReport {
  id: string; // e.g. "scan-a1b2c3d4"
  projectPath: string;
  timestamp: string; // ISO 8601
  scanType: ScanType;
  findings: ScanFinding[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  scannersRun: string[];
  scannersSkipped: string[]; // format: "toolname: reason"
  durationMs: number;
  sbomOutputs?: string[]; // Raw SBOM content strings
  sbomHash?: string; // SHA-256 hash of SBOM content (when --sbom is used)
  sbomPath?: string; // Path where SBOM was saved
  errors?: string[]; // Scanner crash messages
  policyResult?: { passed: boolean; violations: string[] }; // Scan policy evaluation
}

interface ScanFinding {
  id: string;
  tool: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  category: "SECURITY" | "DEPENDENCY" | "IAC" | "SECRETS" | "LICENSE";
  file?: string;
  line?: number;
  message: string;
  recommendation?: string;
  autoFixAvailable: boolean;
  cve?: string; // CVE identifier (e.g. "CVE-2021-44228")
  cvss?: number; // CVSS score (0-10)
  cwe?: string; // CWE identifier (e.g. "CWE-79")
  fixVersion?: string; // Version that fixes the vulnerability
}
```

---

## Remediation

### How It Works

1. **Filter** — Only HIGH and CRITICAL findings are sent for remediation
2. **LLM analysis** — Findings are sent to the configured provider with a structured Zod schema
3. **Fix generation** — The LLM produces a `RemediationPlan` with specific file patches
4. **Patch application** — Fixes are applied via three action types:
   - `replace` — String replacement in a file (old>>>new format)
   - `update-version` — Version update in `package.json` or `requirements.txt`
   - `write` — Full file overwrite

### Safety

- Path-traversal protection prevents fixes from modifying files outside the project directory
- All fixes are shown for approval before application (unless `--yes` is used)
- Applied fixes are logged in the scan report

---

## SBOM Persistence & Versioning

When running `dojops scan --sbom`, the SBOM output is saved to `.dojops/sbom/` and its SHA-256 hash is computed and stored in the scan report:

- **Hash tracking** — Each SBOM's content hash (`sbomHash`) is stored in the scan report, enabling integrity verification
- **Change detection** — On subsequent scans, the current SBOM hash is compared against the previous scan's hash. If the SBOM has changed, a warning is displayed:
  ```
  SBOM changed since last scan (previous: abc123..., current: def456...)
  ```
- **Audit trail** — SBOM hashes are included in the scan history, providing a versioned record of dependency composition over time

This enables compliance workflows that require tracking dependency changes across releases.

---

## Dashboard Integration

The **Security** tab in the web dashboard displays:

- Severity breakdown bar chart
- Category distribution
- Findings table with pagination and filtering
- Scan history timeline
- Top recurring issues

Data is sourced from `.dojops/scan-history/*.json` via the `MetricsAggregator`.

---

## Monorepo Support

The scanner's `discoverProjectDirs()` function searches up to 2 levels deep for sub-projects, enabling monorepo scanning. It skips common non-project directories: `node_modules`, `.git`, `.dojops`, `dist`, `build`, `coverage`, `.next`, `.cache`, `.turbo`, `__pycache__`, `.venv`, `venv`, `.tox`, `target`.
