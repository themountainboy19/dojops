---
name: lint
description: Lint code in the ODA monorepo using ESLint via pnpm. Check all packages or a specific package for style and quality issues.
argument-hint: "[package-name]"
disable-model-invocation: false
allowed-tools: Bash
---

Lint the ODA monorepo for code quality issues.

## Commands

### Lint all packages

```bash
pnpm lint
```

### Lint a specific package

```bash
pnpm --filter @odaops/$ARGUMENTS lint
```

## Notes

- ESLint v9 flat config with typescript-eslint
- Prettier compatibility via eslint-config-prettier
- Run lint before committing code
