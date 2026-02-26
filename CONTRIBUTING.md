# Contributing

Contributions to DojOps are welcome! Please see the full contributing guide at [docs/contributing.md](docs/contributing.md) for:

- Development setup
- Monorepo structure
- Build, test, and lint commands
- Code style conventions
- How to add new tools and agents
- PR workflow and checklist

## Quick Start

```bash
git clone https://github.com/dojops/dojops.git
cd dojops
pnpm install
pnpm build
pnpm test
```

## PR Checklist

- [ ] All tests pass (`pnpm test`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Formatting is correct (`pnpm format:check`)
- [ ] New features include tests
- [ ] Breaking changes are documented
