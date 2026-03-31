# Task: Build Shape Checker

Build a Deno CLI tool called `shape-checker` that statically analyzes TypeScript projects for hexagonal architecture compliance. The tool must enforce its own rules on itself — when you run it against this repo, it must produce **0 violations**.

## What to Build

A compiled binary that:
1. Walks a target project directory
2. Checks every file and folder against 7 architectural rules
3. Prints violations grouped by rule with colored output
4. Exits 0 (clean) or 1 (violations found)
5. Optionally generates AI fix suggestions via `--llm` flag (calls `claude` CLI)
6. Optionally uses an LSP server (baked in at compile time) for deep type analysis

## Architecture the Tool Enforces

Projects must follow this structure, defined in `canonical-paths.json`:

```
src/
  bootstrap/              mod.ts, config.ts
  core/
    business/<feature>/   mod.ts, test.ts
    data/<service>/       mod.ts, smk.test.ts
    dto/<name>.ts
  <module>/
    mod-root.ts
    domain/
      business/
        poly-mod.ts       (optional)
        <feature>/        mod.ts, test.ts
      data/<service>/     mod.ts, smk.test.ts
      coordinators/<process>/  mod.ts, int.test.ts
    entrypoints/<name>.ts
    dto/<name>.ts
fixtures/  e2e/  assets/
```

## The 7 Rules

### 1. structure
Validate file/folder paths against `canonical-paths.json`. Forbidden dir names (`lib`, `modules`, `internal`), loose file names (`utils`, `helpers`, `common`, `shared`), root files against `$rootFiles` allowlist. Directories must resolve in the spec tree. Files must be in directories that expect files.

### 2. layer-restrictions
Enforce import directions between hexagonal layers:
- `business` → business, dto
- `data` → data, dto
- `coordinators` → business, data, coordinators, dto
- `entrypoints` → business, data, coordinators, entrypoints, dto
- `dto` → dto
- `bootstrap` → everything

With LSP: trace re-exports via `findSymbolDefinition` to catch hidden boundary crossings.

### 3. module-isolation
Modules import only from themselves or `core/`. Bootstrap imports any module but only through its `mod-root.ts`. Cross-module imports are forbidden.

With LSP: same definition tracing to catch leaks through re-exports.

### 4. poly-isolation
External code must import through `poly-mod.ts`, never from internal feature files within that directory.

With LSP: verify poly-mod imports actually resolve within the poly directory scope.

### 5. poly-detection
Detect when 3+ sibling business features export functions with the same names and compatible type signatures — they should be behind a `poly-mod.ts`. **Requires LSP** — returns null without it.

Uses `getSiblingExportSignatures` + `getSymbolType` to compare across siblings.

### 6. dto-validation
Every file in a `dto/` directory must contain runtime validation (zod, valibot, typebox patterns). Type-only DTOs fail because they disappear at runtime.

With LSP: verify exports aren't all type-only despite regex matches (catches false positives).

### 7. barrel-discipline
Re-exports (`export { x } from`, `export * from`) only allowed in `mod-root.ts`, `poly-mod.ts`, and `bootstrap/` files.

## LSP Integration

The tool integrates a generic LSP client:
- At compile time, `build.ts` takes an LSP command as argument (default: `deno lsp`), resolves the binary path, and bakes it into the binary
- At runtime, the pipeline spawns the LSP, negotiates capabilities, and injects it into the rule context
- Rules check `ctx.lsp?.capabilities` before using LSP methods — graceful fallback when unavailable
- The LSP API is **symbol-based**: `getSymbolType(file, name)`, `findSymbolDefinition(file, name)`, etc. — not position-based

## LLM Integration

The `--llm` flag calls `claude` CLI for each violation to generate fix suggestions. Each rule exports a `SYSTEM_PROMPT` and `buildPrompt()` function. The tool clears `CLAUDECODE` and `CLAUDE_CODE_ENTRYPOINT` env vars so it works inside Claude Code sessions.

## Build Commands

```sh
deno task compile                    # default LSP: deno lsp
deno task compile 'deno lsp'         # explicit
deno task compile 'ts-server --stdio' # different LSP
```

## Acceptance Criteria

1. `deno check main.ts` — type-checks clean
2. `deno test --allow-read --allow-net --allow-env --allow-run src/` — all tests pass
3. `deno task compile` — produces binary
4. `./shape-checker <this-repo>` — **0 violations**
5. `./shape-checker <this-repo> --llm` — violations (if any) get AI suggestions
6. The tool itself follows the architecture it enforces — it is structured as a hexagonal module under `src/shape-checker/` with proper layers, mod-root, poly-mod, tests, and DTOs with validation
