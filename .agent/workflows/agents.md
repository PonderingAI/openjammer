---
description: General development guidelines for OpenJammer
---

# OpenJammer Development Guidelines

## Package Manager

**Always use `bun`** instead of `npm` or `yarn` for all package management operations:

```bash
# Install dependencies
bun install

# Add a package
bun add <package-name>

# Add a dev dependency
bun add -d <package-name>

# Run scripts
bun run dev
bun run build
bun run lint

# Run tests
bun test
```

## Why Bun?

- Faster installation and execution
- Built-in TypeScript support
- Compatible with npm packages
- Lower memory usage

## Quick Reference

| Operation | Command |
|-----------|---------|
| Install deps | `bun install` |
| Dev server | `bun run dev` |
| Build | `bun run build` |
| Lint | `bun run lint` |
| Add package | `bun add <pkg>` |
