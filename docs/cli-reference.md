# CLI Reference

Complete reference for the `oda` command-line interface.

---

## Commands

### Generation & Planning

| Command                       | Description                                     |
| ----------------------------- | ----------------------------------------------- |
| `oda <prompt>`                | Generate DevOps config (default command)        |
| `oda generate <prompt>`       | Explicit generation (same as default)           |
| `oda plan <prompt>`           | Decompose goal into dependency-aware task graph |
| `oda plan --execute <prompt>` | Plan + execute with approval workflow           |
| `oda apply [<plan-id>]`       | Execute a saved plan                            |
| `oda apply --verify`          | Execute with external config verification       |
| `oda apply --resume`          | Resume a partially-failed plan                  |
| `oda apply --dry-run`         | Preview changes without writing files           |
| `oda validate [<plan-id>]`    | Validate plan against schemas                   |
| `oda explain [<plan-id>]`     | LLM explains a plan in plain language           |

### Diagnostics & Analysis

| Command                   | Description                                        |
| ------------------------- | -------------------------------------------------- |
| `oda debug ci <log>`      | Diagnose CI/CD log failures (root cause, fixes)    |
| `oda analyze diff <diff>` | Analyze infrastructure diff (risk, cost, security) |
| `oda scan`                | Security scan: vulnerabilities, deps, IaC, secrets |
| `oda scan --security`     | Run security scanners only (trivy, gitleaks)       |
| `oda scan --deps`         | Run dependency audit only (npm, pip)               |
| `oda scan --iac`          | Run IaC scanners only (checkov, hadolint)          |
| `oda scan --fix`          | Generate and apply LLM-powered remediation         |

### Interactive

| Command                   | Description                              |
| ------------------------- | ---------------------------------------- |
| `oda chat`                | Interactive multi-turn AI DevOps session |
| `oda chat --session=NAME` | Resume or create a named session         |
| `oda chat --resume`       | Resume the most recent session           |
| `oda chat --agent=NAME`   | Pin conversation to a specialist agent   |

Chat supports slash commands: `/exit`, `/agent <name>`, `/plan <goal>`, `/apply`, `/scan`, `/history`, `/clear`, `/save`.

### Agents & Tools

| Command                    | Description                                      |
| -------------------------- | ------------------------------------------------ |
| `oda agents list`          | List all 16 specialist agents                    |
| `oda agents info <name>`   | Show agent details and tool dependencies         |
| `oda tools list`           | List system tools with install status            |
| `oda tools install <name>` | Download tool into sandbox (~/.oda/tools/)       |
| `oda tools remove <name>`  | Remove a sandboxed tool                          |
| `oda tools clean`          | Remove all sandbox tools                         |
| `oda inspect <target>`     | Inspect config, policy, agents, or session state |

### History & Audit

| Command                      | Description                            |
| ---------------------------- | -------------------------------------- |
| `oda history list`           | View execution history                 |
| `oda history show <plan-id>` | Show plan details and per-task results |
| `oda history verify`         | Verify audit log hash chain integrity  |
| `oda destroy <plan-id>`      | Remove generated artifacts from a plan |
| `oda rollback <plan-id>`     | Reverse an applied plan                |

### Configuration & Server

| Command                          | Description                                      |
| -------------------------------- | ------------------------------------------------ |
| `oda config`                     | Configure provider, model, tokens (interactive)  |
| `oda config show`                | Display current configuration                    |
| `oda config profile create NAME` | Save current config as a named profile           |
| `oda config profile use NAME`    | Switch to a named profile                        |
| `oda config profile list`        | List all profiles                                |
| `oda auth login`                 | Authenticate with LLM provider                   |
| `oda auth status`                | Show saved tokens and default provider           |
| `oda serve [--port=N]`           | Start API server + web dashboard                 |
| `oda init`                       | Initialize `.oda/` project directory + repo scan |
| `oda doctor`                     | System health diagnostics + project metrics      |

---

## Global Options

| Option              | Description                                                         |
| ------------------- | ------------------------------------------------------------------- |
| `--provider=NAME`   | LLM provider: `openai`, `anthropic`, `ollama`, `deepseek`, `gemini` |
| `--model=NAME`      | LLM model override                                                  |
| `--profile=NAME`    | Use named config profile                                            |
| `--output=FORMAT`   | Output: `table` (default), `json`, `yaml`                           |
| `--verbose`         | Verbose output                                                      |
| `--debug`           | Debug-level output with stack traces                                |
| `--quiet`           | Suppress non-essential output                                       |
| `--no-color`        | Disable color output                                                |
| `--non-interactive` | Disable interactive prompts                                         |
| `--yes`             | Auto-approve all confirmations (implies `--non-interactive`)        |
| `--help, -h`        | Show help message                                                   |

---

## Exit Codes

| Code | Meaning                              |
| ---- | ------------------------------------ |
| 0    | Success                              |
| 1    | General error                        |
| 2    | Validation error                     |
| 3    | Approval required                    |
| 4    | Lock conflict (concurrent operation) |
| 5    | No `.oda/` project                   |
| 6    | HIGH security findings detected      |
| 7    | CRITICAL security findings detected  |

---

## Examples

### Generating Configs

```bash
# Generate with automatic agent routing
oda "Create a Terraform config for S3 with versioning"
oda "Write a Kubernetes deployment for nginx with 3 replicas"
oda "Set up monitoring with Prometheus and alerting rules"
oda "Create a multi-stage Dockerfile for a Go application"

# Override provider/model for a single command
oda --provider=anthropic "Create a Helm chart for Redis"
oda --model=gpt-4o "Design a VPC with public and private subnets"
```

### Planning and Execution

```bash
# Decompose a complex goal into tasks
oda plan "Set up CI/CD for a Node.js app with Docker and Kubernetes"

# Plan and execute immediately
oda plan --execute --yes "Create CI pipeline for a Python project"

# Execute a saved plan
oda apply
oda apply --dry-run          # preview only
oda apply --verify           # with external validation
oda apply --resume --yes     # resume failed tasks, auto-approve
```

### Diagnostics

```bash
# Debug CI failures
oda debug ci "ERROR: tsc failed with exit code 1..."
oda debug ci "npm ERR! ERESOLVE unable to resolve dependency tree"

# Analyze infrastructure diffs
oda analyze diff "terraform plan output..."
oda explain last
```

### Security Scanning

```bash
# Full project scan
oda scan

# Targeted scans
oda scan --security          # trivy + gitleaks
oda scan --deps              # npm-audit + pip-audit
oda scan --iac               # checkov + hadolint

# Auto-remediation
oda scan --fix --yes
```

### Interactive Chat

```bash
# Start a new session
oda chat

# Named session with agent pinning
oda chat --session=infra --agent=terraform

# Resume the most recent session
oda chat --resume
```

### Tool Management

```bash
# Check available tools
oda tools list

# Install external validators
oda tools install terraform
oda tools install kubectl
oda tools install hadolint

# Cleanup
oda tools clean
```

### Administration

```bash
# System diagnostics
oda doctor

# Browse agents
oda agents list
oda agents info terraform-specialist

# Audit trail
oda history list
oda history show plan-abc123
oda history verify

# Start dashboard
oda serve --port=8080

# Configuration profiles
oda config profile create staging
oda config profile use staging
oda config profile list
```
