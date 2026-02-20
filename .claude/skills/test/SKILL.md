---
name: test
description: Run tests for the ODA monorepo using Vitest via pnpm. Run all tests, tests for a specific package, or tests matching a pattern.
argument-hint: "[package-name | --grep pattern]"
disable-model-invocation: false
allowed-tools: Bash
---

Run tests for the ODA monorepo.

## Commands

### Run all tests across all packages

```bash
pnpm test
```

### Run tests for a specific package

```bash
pnpm --filter @odaops/$ARGUMENTS test
```

### Run tests matching a pattern

```bash
pnpm test -- --grep "$ARGUMENTS"
```

## Notes

- Run tests before creating PRs
- Fix any failing tests before committing
- Use focused tests during development: `/test core`
