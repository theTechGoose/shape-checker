# Plan: Shape Enforcer — Deno CLI Tool

## Context

`shape.md` defines a modular hexagonal architecture spec with statically checkable rules. This is a compilable Deno CLI tool that enforces those rules against any target project. Binary produced via `deno compile`.

## Project Structure

```
testy/
├── main.ts                          # CLI entry point — runs the pipeline
├── deno.json                        # tasks: check, compile
├── types.ts                         # Entry, Rule, PipelineContext, EntryResult
├── context.ts                       # Walks file tree, builds PipelineContext
├── classify.ts                      # Shared: classifies paths into module/layer
├── shape.md                         # Architecture spec
├── rules/
│   ├── mod.ts                       # Barrel: exports all rules
│   └── <rule-name>/
│       ├── mod.ts                   # check(path, target, ctx) → string[] | null
│       ├── llm.ts                   # generateSuggestion(violations, path, target) → string
│       └── (helpers)                # any rule-specific data or logic
```

## Types

```
EntryTarget = string | "folder"
Rule { name, description, check(path, target, ctx) → string[]|null, generateSuggestion(violations, path, target) → string }
PipelineContext { targetDir, files[], dirs[], getFileContent(rel), getImports(rel) }
EntryResult { path, target, rule, violations[], suggestion }
```

## File Manifest

```
create  deno.json
create  types.ts
create  context.ts
create  classify.ts
create  main.ts
create  rules/mod.ts
create  rules/structure/mod.ts
create  rules/structure/llm.ts
move    canonical-paths.json → rules/structure/canonical-paths.json
create  rules/layer-restrictions/mod.ts
create  rules/layer-restrictions/llm.ts
create  rules/module-isolation/mod.ts
create  rules/module-isolation/llm.ts
create  rules/poly-isolation/mod.ts
create  rules/poly-isolation/llm.ts
create  rules/dto-validation/mod.ts
create  rules/dto-validation/llm.ts
create  rules/barrel-discipline/mod.ts
create  rules/barrel-discipline/llm.ts
```

## 1. `deno.json`

```json
{
  "tasks": {
    "check": "deno run --allow-read main.ts",
    "compile": "deno compile --allow-read -o shape-checker main.ts"
  },
  "compilerOptions": { "strict": true }
}
```

## 2. `types.ts`

Implement the interfaces from the Types section above.

## 3. `context.ts`

```
buildContext(targetDir: string): Promise<PipelineContext>

  walkDir(root, prefix):
    for entry in Deno.readDir(join(root, prefix)):
      skip if entry.name in {".git", "node_modules"} or starts with "."
      rel = prefix ? prefix/entry.name : entry.name
      if directory → dirs.push(rel), recurse walkDir(root, rel)
      if file     → files.push(rel)

  getFileContent(rel): Deno.readTextFile(join(targetDir, rel))

  getImports(rel):
    content = await getFileContent(rel)
    regex match all of:
      import ... from "specifier"
      export ... from "specifier"
      import("specifier")
    for each specifier:
      if starts with "." → resolve: normalize(join(dirname(rel), specifier))
      else → keep as-is (external)
    return specifiers[]
```

## 4. `classify.ts`

Used by import-related rules. Given a relative path under `src/`:

```
classifyFile(path) → { module, layer, isModRoot, isPolyMod, isBootstrap }

  segments = path.split("/")
  if segments[0] != "src" → { module: null, layer: "unknown" }
  if segments[1] == "bootstrap" → { module: "bootstrap", layer: "bootstrap", isBootstrap: true }
  if segments[1] == "core" → { module: "core", layer: <first segment matching a layer name> }
  else → { module: segments[1], layer: <first segment matching a layer name> }

  layer names: "business", "data", "coordinators", "entrypoints", "dto"
  isModRoot: basename without ext == "mod-root"
  isPolyMod: basename without ext == "poly-mod"

getModuleFromPath(path) → segments[0]=="src" ? segments[1] : null
getLayerFromPath(path)  → first segment in path matching a layer name, or "unknown"
isModRootImport(path)   → basename without ext == "mod-root"
```

## 5. `main.ts`

```typescript
import { rules } from "./rules/mod.ts";
import { buildContext } from "./context.ts";
import { extname } from "https://deno.land/std/path/mod.ts";

async function main() {
  const targetDir = resolve(Deno.args[0]);

  const ctx = await buildContext(targetDir);

  const entries = [
    ...ctx.dirs.map(p  => ({ path: p, target: "folder" as const })),
    ...ctx.files.map(p => ({ path: p, target: extname(p).slice(1) || "unknown" })),
  ];

  const results: EntryResult[] = [];

  for (const entry of entries) {
    for (const rule of rules) {
      const violations = await rule.check(entry.path, entry.target, ctx);
      if (violations !== null) {
        results.push({
          path: entry.path,
          target: entry.target,
          rule: rule.name,
          violations,
          suggestion: rule.generateSuggestion(violations, entry.path, entry.target),
        });
      }
    }
  }

  // Report: group by rule, print path + violations + suggestion
  // ANSI colors: red violations, yellow path, cyan suggestion
  // Exit 1 if results.length > 0
}
```

## 6. `rules/structure/` — Tree Walker

Three files: `canonical-paths.json` (move from root), `mod.ts`, `llm.ts`.

### JSON conventions

```
"key": { ... }                → folder
"key": "description"          → required file (string = its description)
"<descriptor>": { ... }       → wildcard folder (any name matches)
"<descriptor>": "description" → wildcard file (any name matches)
"$key": ...                   → metadata (skipped by walker)
```

### `mod.ts`

**`resolveNode(segments)`** — walks the JSON tree:
```
current = SHAPE (the imported JSON)
for each segment:
  fixedChildren = keys where value is object, not $-prefixed, not <...>
  descriptor    = first key matching <...> whose value is object
  if segment matches a fixed key → descend
  else if descriptor exists      → descend into descriptor
  else                           → return null
return current
```

**`getRequiredFiles(node)`** — keys where value is string, not `$`-prefixed, not `<...>`

**`getExpectedAt(node)`** — returns `{ desc, folders[], files[{name, desc}], descriptor }`

**`check(path, target, ctx)`**:
```
if target == "folder":
  node = resolveNode(path segments)
  violations = []
  if node == null            → "not-allowed"
  if name in FORBIDDEN_DIRS  → "forbidden:{name}"
  if name == "core" && path != "src/core" → "forbidden:core"
  if name in LOOSE_NAMES     → "loose:{name}"
  if node != null:
    for each required file in node:
      if not in ctx.files under this dir → "missing-file:{key}"
  return violations or null

if target is a file extension:
  if top-level file → null (config files OK)
  parentNode = resolveNode(parent segments)
  if null → ["not-allowed"]
  if baseName in LOOSE_NAMES → ["loose:{baseName}"]
  return null
```

### `llm.ts`

Imports JSON and `resolveNode`/`getExpectedAt` from `./mod.ts`. Parses coded violation strings:

```
"not-allowed"         → getExpectedAt(parent) → "Not a valid location. Expected here: {folders}, {descriptor}. {desc}"
"forbidden:{name}"    → "'{name}' is a reserved name."
"loose:{name}"        → "Loose utility forbidden. Place in business/<feature>/, data/<service>/, etc."
"missing-file:{file}" → look up description from resolved node → "Missing required file: {file}.ts — {description}"
```

## 7. `rules/layer-restrictions/`

**`mod.ts`** — `check(path, target, ctx)`:
```
if target == "folder" or non-source extension → return null
classification = classifyFile(path)
if not inSrc or layer == "unknown" → return null

allowedTargets = {
  business:     {business, dto},
  data:         {data, dto},
  coordinators: {business, data, coordinators, dto},
  entrypoints:  {business, data, coordinators, entrypoints, dto},
  dto:          {dto},
  bootstrap:    {business, data, coordinators, entrypoints, dto},
}

imports = await ctx.getImports(path)
for each imp starting with "src/":
  targetLayer = getLayerFromPath(imp)
  if targetLayer != "unknown" and not in allowedTargets[classification.layer]:
    → "{classification.layer}→{targetLayer}:{imp}"
```

**`llm.ts`**: Parse `"sourceLayer→targetLayer:importPath"` → `"{sourceLayer} cannot import from {targetLayer}. Move shared logic to a coordinator, or extract to core."`

## 8. `rules/module-isolation/`

**`mod.ts`** — `check(path, target, ctx)`:
```
if target == "folder" or non-source → return null
source = classifyFile(path)
if not inSrc or no module → return null

for each imp starting with "src/":
  targetModule = getModuleFromPath(imp)
  if targetModule == source.module or targetModule == "core" → skip
  if source.module == "bootstrap" and not isModRootImport(imp):
    → "bootstrap-not-modroot:{targetModule}:{imp}"
  else:
    → "cross-module:{source.module}→{targetModule}:{imp}"
```

**`llm.ts`**:
- `"bootstrap-not-modroot:{mod}:{imp}"` → `"Bootstrap must import {mod} through its mod-root. Import from src/{mod}/mod-root instead of {imp}."`
- `"cross-module:{src}→{tgt}:{imp}"` → `"Module '{src}' cannot import from '{tgt}'. Extract shared code to core/, or import through mod-root from bootstrap."`

## 9. `rules/poly-isolation/`

**`mod.ts`** — `check(path, target, ctx)`:
```
if target == "folder" or non-source → return null

polyFeatures = ctx.files where basename without ext == "poly-mod"
  → map to { dir: dirname(f), polyModPath: f }

for each imp, for each poly:
  if path inside poly.dir → skip
  if imp inside poly.dir and basename != "poly-mod":
    → "bypass:{poly.polyModPath}:{imp}"
```

**`llm.ts`**: `"bypass:{polyMod}:{imp}"` → `"Import from {polyMod} instead of {imp}. poly-mod is the only public surface for this polymorphic feature."`

## 10. `rules/dto-validation/`

**`mod.ts`** — `check(path, target, ctx)`:
```
if target == "folder" or non-source → return null
if "/dto/" not in path segments → return null
if .test. or .spec. in path → return null

content = await ctx.getFileContent(path)
validationPatterns = [
  /\bz\.\w+/,  /\b(parse|safeParse)\s*\(/,  /\bvalidate\w*\s*\(/,
  /\bthrow\s+new\b/,  /\bschema\b/i,  /\.refine\s*\(/,
  /\bType\.\w+/,  /\bv\.\w+\(/
]
if no pattern matches → ["no-validation"]
```

**`llm.ts`**: → `"This DTO has no validation logic. Add a runtime validation schema (e.g., zod, valibot) or throw on invalid input."`

## 11. `rules/barrel-discipline/`

**`mod.ts`** — `check(path, target, ctx)`:
```
if target == "folder" or non-source → return null
if baseName in {"poly-mod", "mod-root"} or path starts with "src/bootstrap/" → return null

content = await ctx.getFileContent(path)
barrelRe = /export\s+(\{[^}]*\}\s+from|(\*|\* as \w+)\s+from)\s+["'][^"']+["']/g
if matches → ["barrel-in-wrong-place"]
```

**`llm.ts`**: → `"Re-exports are only allowed in mod-root, poly-mod, or bootstrap files. Move these barrel exports to the appropriate location."`

## Verify

```bash
deno check main.ts
deno task compile
./shape-checker /path/to/project
```
