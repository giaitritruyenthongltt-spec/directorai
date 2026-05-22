# Contributing to DirectorAI

## Setup

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Lint + type-check
pnpm lint
pnpm typecheck
```

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(panel): add chat-style tool log
fix(server): handle WebSocket reconnect race
docs(adr): document MCP protocol choice
chore(deps): bump turbo to 2.2.0
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

## Branch model

- `main` — protected, always green.
- `develop` — integration branch.
- `feat/<name>` `fix/<name>` — feature/bugfix branches off `develop`.

## Architectural rules

1. **Layer rule**: dependencies flow downward only (see [`docs/architecture/overview.md`](../architecture/overview.md)).
2. **One responsibility per module**: files > 300 lines or doing > 1 thing must be split.
3. **Interface over implementation**: expose via abstract type, hide concrete class.
4. **Idempotency**: all MCP tools must be idempotent and provide undo.
5. **Config-driven**: prefer YAML/JSON config over hardcoded values.

## Adding a new module

1. Create folder under `packages/<name>` or `apps/<name>`.
2. Copy `tsconfig.json` from an existing sibling.
3. Add to `pnpm-workspace.yaml` (matched by glob already).
4. Add to layer documentation.
5. Create at least one test.
6. Run `pnpm install` to wire workspace links.
