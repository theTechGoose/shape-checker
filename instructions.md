# Shape Checker

A static analysis tool that enforces hexagonal/modular architecture rules on TypeScript projects. Optionally uses an LSP server for deep type analysis and Claude for AI-powered fix suggestions.

## Prerequisites

- Deno >= 2.x
- `claude` CLI on PATH (only for `--llm` mode)

## Build

```sh
# Default — bakes in 'deno lsp' as the LSP server
deno task compile

# Custom LSP server
deno task compile 'typescript-language-server --stdio'
```

Produces a `./shape-checker` binary.

## Usage

```sh
# Static analysis (works anywhere, including inside Claude Code)
./shape-checker /path/to/project

# With AI-powered fix suggestions
./shape-checker /path/to/project --llm
```

Exit codes:
- `0` — no violations
- `1` — violations found
- `2` — usage error

## Rules

| Rule | What it enforces |
|---|---|
| **structure** | File/folder placement matches `canonical-paths.json` |
| **layer-restrictions** | Import directions follow hexagonal layers (business, data, coordinators, entrypoints, dto, bootstrap) |
| **module-isolation** | No cross-module imports; bootstrap only imports through mod-root |
| **poly-isolation** | External code imports through poly-mod, never internal files |
| **poly-detection** | Detects 3+ sibling features with identical exports that should be behind a poly-mod (requires LSP) |
| **dto-validation** | DTO files must contain runtime validation (zod, valibot, etc.) |
| **barrel-discipline** | Re-exports only allowed in mod-root, poly-mod, and bootstrap |

## Architecture Spec

Projects are validated against the structure defined in `canonical-paths.json`:

```
src/
  bootstrap/          # Composition root — wires modules, starts the app
    mod.ts
    config.ts
  core/               # Shared across all modules
    business/<feature>/mod.ts, test.ts
    data/<service>/mod.ts, smk.test.ts
    dto/<name>.ts
  <module>/           # Isolated module
    mod-root.ts       # Only external import surface
    domain/
      business/
        poly-mod.ts   # Polymorphic surface (optional)
        <feature>/mod.ts, test.ts
      data/<service>/mod.ts, smk.test.ts
      coordinators/<process>/mod.ts, int.test.ts
    entrypoints/<name>.ts
    dto/<name>.ts
fixtures/
e2e/
assets/
```

## Layer Import Rules

```
business    → business, dto
data        → data, dto
coordinators → business, data, coordinators, dto
entrypoints → business, data, coordinators, entrypoints, dto
dto         → dto
bootstrap   → everything
```

## LSP Integration

When compiled with an LSP server, the tool spawns it at runtime for type-level analysis:

- **Definition tracing** — resolves re-exports to catch hidden layer/module boundary crossings
- **Symbol type analysis** — compares export signatures across siblings for poly-detection
- **Type-only detection** — verifies DTO exports have runtime presence, not just types

All LSP features degrade gracefully. If the LSP is unavailable or doesn't support a capability, rules fall back to regex/path-based analysis.

## Development

```sh
# Type-check
deno check main.ts

# Run tests
deno test --allow-read --allow-net --allow-env --allow-run src/

# Run without compiling
deno task check /path/to/project

# Compile and install
deno task compile && cp shape-checker ~/bin/
```
