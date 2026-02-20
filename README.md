# ODA – Open DevOps Agent

> AI-powered DevOps automation assistant.

ODA is an open-source agentic DevOps system designed to automate, generate, validate, and execute infrastructure and CI/CD tasks safely.

---

## 🚀 Vision

ODA aims to become:

- A DevOps co-pilot
- An infrastructure-aware AI agent
- A safe execution engine for IaC
- A modular open-source automation framework

---

## ✨ Core Capabilities (Planned)

- GitHub Actions generation
- GitLab CI generation
- Jenkinsfile creation
- Terraform generation + plan
- Kubernetes manifest creation
- Helm & Kustomize support
- Ansible playbook generation
- Secure execution sandbox
- Multi-LLM provider support

---

## 🧠 Architecture

ODA is built around:

- LLM Orchestrator Layer
- Planner Engine
- Tool SDK System
- Secure Execution Engine
- CLI + API Interface

Full details available in `ARCHITECTURE.md`.

---

## 🔌 LLM Providers Supported

- OpenAI
- Anthropic
- Ollama (local models)

Provider can be configured via:

```bash
ODA_PROVIDER=openai
```

---

## 📦 Installation

```bash
pnpm install
cp .env.example .env
pnpm build
```

## ▶️ Usage

```bash
ODA_PROVIDER=ollama pnpm --filter @oda/cli dev generate github workflow for node app
```

## 🛣 Roadmap

See VISION.md for detailed roadmap and long-term direction.

## 🤝 Contributing

Contributions welcome. This project aims to become a production-grade DevOps agent system.

## 📜 License

MIT License.
