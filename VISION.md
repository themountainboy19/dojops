# ODA Vision & Roadmap

## Mission

Build a production-grade AI DevOps Assistant that:

- Understands infrastructure
- Generates safe configurations
- Executes securely
- Scales across teams
- Remains open-source

---

## Phase 1 – Foundation

- Multi-provider LLM abstraction
- CLI interface
- GitHub Actions generation
- Terraform template generation
- Basic planner engine

---

## Phase 2 – Execution & Safety

- Terraform plan/apply sandbox
- Kubernetes apply preview
- Ansible dry-run
- Policy validation
- Diff preview system

---

## Phase 3 – Intelligence

- Multi-agent system
- Infra cost estimation
- Failure root cause analysis
- CI debugging agent
- Drift detection

---

## Phase 4 – Developer Experience

- Rich terminal UI (`@clack/prompts`)
- Interactive configuration (arrow-key prompts, password input)
- Spinners for all async LLM operations
- Styled note panels for structured results (CI diagnosis, infra diff, task graphs)
- Semantic log levels (success, error, warn, info, step)
- Session framing (intro/outro)
- Plain-text help output preserved for pipe compatibility

---

## Long-Term Goal

Become the open-source DevOps agent platform.

Possible future directions:

- SaaS control plane
- VSCode extension
- Enterprise plugin ecosystem
- Internal company DevOps copilots

---

## Philosophy

ODA is not a prompt wrapper.

ODA is an engineering system.

It prioritizes:

- Safety
- Structure
- Determinism
- Extensibility
- Professional-grade architecture
