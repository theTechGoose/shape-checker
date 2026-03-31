# Exec: Shape Enforcer — Step-by-Step Build Guide

> **Prereqs**: Deno ≥ 2.x installed. `claude` CLI on PATH only needed for `--llm` mode.
> **Reference**: `plan.md` for architecture rationale. This file is the build sequence.
>
> **Nested session caveat**: The `--llm` flag calls Claude via the Agent SDK, which spawns a `claude` subprocess. This **cannot run inside an existing Claude session** (e.g. from Claude Code). Run `--llm` from a plain terminal only. Without `--llm`, the tool is purely static and works anywhere.

---

## Phase 1 — Foundation

### Step 1.1: `deno.json`

```json
{
  "tasks": {
    "check": "deno run --allow-read --allow-net --allow-env --allow-run main.ts",
    "compile": "deno compile --allow-read --allow-net --allow-env --allow-run -o shape-checker main.ts"
  },
  "compilerOptions": { "strict": true }
}
```

### Step 1.2: `types.ts`

```ts
export type EntryTarget = string | "folder";

export interface Rule {
  name: string;
  description: string;
  check(path: string, target: EntryTarget, ctx: PipelineContext): Promise<string[] | null>;
  generateSuggestion(violations: string[], path: string, target: EntryTarget): Promise<string>;
}

export interface PipelineContext {
  targetDir: string;
  files: string[];
  dirs: string[];
  getFileContent(rel: string): Promise<string>;
  getImports(rel: string): Promise<string[]>;
}

export interface EntryResult {
  path: string;
  target: EntryTarget;
  rule: string;
  violations: string[];
  suggestion?: string;
}
```

**Verify:** `deno check types.ts`

---

## Phase 2 — Infrastructure

### Step 2.1: `context.ts`

```ts
import { join, dirname, normalize } from "jsr:@std/path";
import type { PipelineContext } from "./types.ts";

const SKIP = new Set([".git", "node_modules"]);

async function walkDir(
  root: string,
  prefix: string,
  files: string[],
  dirs: string[],
): Promise<void> {
  const base = prefix ? join(root, prefix) : root;
  for await (const entry of Deno.readDir(base)) {
    if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      dirs.push(rel);
      await walkDir(root, rel, files, dirs);
    } else if (entry.isFile) {
      files.push(rel);
    }
  }
}

export async function buildContext(targetDir: string): Promise<PipelineContext> {
  const files: string[] = [];
  const dirs: string[] = [];
  await walkDir(targetDir, "", files, dirs);

  const contentCache = new Map<string, string>();

  async function getFileContent(rel: string): Promise<string> {
    if (contentCache.has(rel)) return contentCache.get(rel)!;
    const text = await Deno.readTextFile(join(targetDir, rel));
    contentCache.set(rel, text);
    return text;
  }

  const importRe =
    /(?:import|export)\s+.*?\s+from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

  async function getImports(rel: string): Promise<string[]> {
    const content = await getFileContent(rel);
    const specifiers: string[] = [];
    for (const m of content.matchAll(importRe)) {
      const spec = m[1] ?? m[2];
      if (spec.startsWith(".")) {
        specifiers.push(normalize(join(dirname(rel), spec)));
      } else {
        specifiers.push(spec);
      }
    }
    return specifiers;
  }

  return { targetDir, files, dirs, getFileContent, getImports };
}
```

### Step 2.2: `classify.ts`

```ts
const LAYERS = new Set(["business", "data", "coordinators", "entrypoints", "dto"]);

export interface Classification {
  module: string | null;
  layer: string;
  isModRoot: boolean;
  isPolyMod: boolean;
  isBootstrap: boolean;
}

export function classifyFile(path: string): Classification {
  const segs = path.split("/");
  const baseName = segs[segs.length - 1].replace(/\.[^.]+$/, "");

  if (segs[0] !== "src") {
    return { module: null, layer: "unknown", isModRoot: false, isPolyMod: false, isBootstrap: false };
  }

  const isModRoot = baseName === "mod-root";
  const isPolyMod = baseName === "poly-mod";
  const isBootstrap = segs[1] === "bootstrap";

  if (isBootstrap) {
    return { module: "bootstrap", layer: "bootstrap", isModRoot, isPolyMod, isBootstrap };
  }

  const module = segs[1] ?? null;
  const layer = segs.find((s) => LAYERS.has(s)) ?? "unknown";

  return { module, layer, isModRoot, isPolyMod, isBootstrap };
}

export function getModuleFromPath(path: string): string | null {
  const segs = path.split("/");
  return segs[0] === "src" ? segs[1] ?? null : null;
}

export function getLayerFromPath(path: string): string {
  return path.split("/").find((s) => LAYERS.has(s)) ?? "unknown";
}

export function isModRootImport(path: string): boolean {
  const base = path.split("/").pop() ?? "";
  return base.replace(/\.[^.]+$/, "") === "mod-root";
}
```

**Verify:** `deno check context.ts classify.ts`

---

## Phase 3 — Rules

Every `llm.ts` shares the same pattern: import `quickQuery` from the Claude Bot gist, build a prompt from violations, return the AI-generated suggestion.

**Gist import used by all `llm.ts` files:**
```ts
import { quickQuery } from "https://gist.githubusercontent.com/theTechGoose/68c8429d1564b36e02350df472a2bdd8/raw/claude-bot.ts";
```

---

### Step 3.1: `rules/structure/mod.ts`

Depends on: `canonical-paths.json` (already exists at this path).

```ts
import SHAPE from "./canonical-paths.json" with { type: "json" };
import type { PipelineContext, EntryTarget } from "../../types.ts";

const FORBIDDEN_DIRS = new Set((SHAPE as Record<string, unknown>)["$forbiddenDirNames"] as string[]);
const LOOSE_NAMES = new Set((SHAPE as Record<string, unknown>)["$looseFileNames"] as string[]);

type ShapeNode = Record<string, unknown>;

export function resolveNode(segments: string[]): ShapeNode | null {
  let current: unknown = SHAPE;
  for (const seg of segments) {
    if (typeof current !== "object" || current === null) return null;
    const node = current as ShapeNode;

    // Fixed children: object values, not $-prefixed, not <...>
    const fixedKey = Object.keys(node).find(
      (k) => !k.startsWith("$") && !k.startsWith("<") && k === seg && typeof node[k] === "object",
    );
    if (fixedKey) {
      current = node[fixedKey];
      continue;
    }

    // Descriptor wildcard: first <...> key whose value is object
    const descriptor = Object.keys(node).find(
      (k) => k.startsWith("<") && k.endsWith(">") && typeof node[k] === "object",
    );
    if (descriptor) {
      current = node[descriptor];
      continue;
    }

    return null;
  }
  return typeof current === "object" && current !== null ? (current as ShapeNode) : null;
}

export function getRequiredFiles(node: ShapeNode): string[] {
  return Object.keys(node).filter(
    (k) => typeof node[k] === "string" && !k.startsWith("$") && !k.startsWith("<"),
  );
}

export function getExpectedAt(node: ShapeNode): {
  desc: string;
  folders: string[];
  files: { name: string; desc: string }[];
  descriptor: string | null;
} {
  const desc = (node["$desc"] as string) ?? "";
  const folders: string[] = [];
  const files: { name: string; desc: string }[] = [];
  let descriptor: string | null = null;

  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith("$")) continue;
    if (k.startsWith("<") && k.endsWith(">")) {
      descriptor = k;
      continue;
    }
    if (typeof v === "object") folders.push(k);
    else if (typeof v === "string") files.push({ name: k, desc: v });
  }

  return { desc, folders, files, descriptor };
}

export async function check(
  path: string,
  target: EntryTarget,
  ctx: PipelineContext,
): Promise<string[] | null> {
  const segments = path.split("/");
  const name = segments[segments.length - 1];

  if (target === "folder") {
    const node = resolveNode(segments);
    const violations: string[] = [];

    if (node === null) violations.push("not-allowed");
    if (FORBIDDEN_DIRS.has(name)) violations.push(`forbidden:${name}`);
    if (name === "core" && path !== "src/core") violations.push("forbidden:core");
    if (LOOSE_NAMES.has(name)) violations.push(`loose:${name}`);

    if (node !== null) {
      const required = getRequiredFiles(node);
      for (const key of required) {
        const found = ctx.files.some(
          (f) => f.startsWith(path + "/") && f.split("/").pop()?.replace(/\.[^.]+$/, "") === key,
        );
        if (!found) violations.push(`missing-file:${key}`);
      }
    }

    return violations.length > 0 ? violations : null;
  }

  // File target
  if (!path.includes("/")) return null; // top-level config files OK

  const parentSegs = segments.slice(0, -1);
  const parentNode = resolveNode(parentSegs);
  if (parentNode === null) return ["not-allowed"];

  const baseName = name.replace(/\.[^.]+$/, "");
  if (LOOSE_NAMES.has(baseName)) return [`loose:${baseName}`];

  return null;
}
```

### Step 3.2: `rules/structure/llm.ts`

```ts
import { quickQuery } from "https://gist.githubusercontent.com/theTechGoose/68c8429d1564b36e02350df472a2bdd8/raw/claude-bot.ts";
import { resolveNode, getExpectedAt } from "./mod.ts";
import type { EntryTarget } from "../../types.ts";

const SYSTEM = `You are a code architecture advisor. The project follows a hexagonal/modular architecture defined in a canonical-paths.json spec. Given structural violations for a file or folder, produce a concise, actionable fix suggestion (2-3 sentences max). Reference the spec's expected structure when relevant.`;

export async function generateSuggestion(
  violations: string[],
  path: string,
  target: EntryTarget,
): Promise<string> {
  const prompt = `Path: ${path} (${target})
Violations: ${JSON.stringify(violations)}

Parent expected structure: ${JSON.stringify(
    (() => {
      const parentSegs = path.split("/").slice(0, -1);
      const parentNode = resolveNode(parentSegs);
      return parentNode ? getExpectedAt(parentNode) : "unknown parent";
    })(),
  )}

What should the developer do to fix these violations?`;

  return await quickQuery(prompt, {
    systemPrompt: SYSTEM,
    model: "claude-haiku-4-5-20251001",
    allowDangerouslySkipPermissions: true,
  });
}
```

---

### Step 3.3: `rules/layer-restrictions/mod.ts`

Create directory `rules/layer-restrictions/` first.

```ts
import { classifyFile, getLayerFromPath } from "../../classify.ts";
import type { PipelineContext, EntryTarget } from "../../types.ts";

const SOURCE_EXTS = new Set(["ts", "tsx", "js", "jsx"]);

const ALLOWED: Record<string, Set<string>> = {
  business: new Set(["business", "dto"]),
  data: new Set(["data", "dto"]),
  coordinators: new Set(["business", "data", "coordinators", "dto"]),
  entrypoints: new Set(["business", "data", "coordinators", "entrypoints", "dto"]),
  dto: new Set(["dto"]),
  bootstrap: new Set(["business", "data", "coordinators", "entrypoints", "dto"]),
};

export async function check(
  path: string,
  target: EntryTarget,
  ctx: PipelineContext,
): Promise<string[] | null> {
  if (target === "folder" || !SOURCE_EXTS.has(target as string)) return null;

  const classification = classifyFile(path);
  if (!classification.module || classification.layer === "unknown") return null;

  const allowed = ALLOWED[classification.layer];
  if (!allowed) return null;

  const imports = await ctx.getImports(path);
  const violations: string[] = [];

  for (const imp of imports) {
    if (!imp.startsWith("src/")) continue;
    const targetLayer = getLayerFromPath(imp);
    if (targetLayer !== "unknown" && !allowed.has(targetLayer)) {
      violations.push(`${classification.layer}→${targetLayer}:${imp}`);
    }
  }

  return violations.length > 0 ? violations : null;
}
```

### Step 3.4: `rules/layer-restrictions/llm.ts`

```ts
import { quickQuery } from "https://gist.githubusercontent.com/theTechGoose/68c8429d1564b36e02350df472a2bdd8/raw/claude-bot.ts";
import type { EntryTarget } from "../../types.ts";

const SYSTEM = `You are a code architecture advisor enforcing layer dependency rules in a hexagonal architecture.

Layer import rules:
- business → business, dto only
- data → data, dto only
- coordinators → business, data, coordinators, dto
- entrypoints → business, data, coordinators, entrypoints, dto
- dto → dto only
- bootstrap → everything

Given violations (format: "sourceLayer→targetLayer:importPath"), suggest how to fix the illegal imports. Be concise (2-3 sentences).`;

export async function generateSuggestion(
  violations: string[],
  path: string,
  _target: EntryTarget,
): Promise<string> {
  const prompt = `File: ${path}
Illegal imports:
${violations.map((v) => `  - ${v}`).join("\n")}

How should the developer fix these layer violations?`;

  return await quickQuery(prompt, {
    systemPrompt: SYSTEM,
    model: "claude-haiku-4-5-20251001",
    allowDangerouslySkipPermissions: true,
  });
}
```

---

### Step 3.5: `rules/module-isolation/mod.ts`

Create directory `rules/module-isolation/`.

```ts
import { classifyFile, getModuleFromPath, isModRootImport } from "../../classify.ts";
import type { PipelineContext, EntryTarget } from "../../types.ts";

const SOURCE_EXTS = new Set(["ts", "tsx", "js", "jsx"]);

export async function check(
  path: string,
  target: EntryTarget,
  ctx: PipelineContext,
): Promise<string[] | null> {
  if (target === "folder" || !SOURCE_EXTS.has(target as string)) return null;

  const source = classifyFile(path);
  if (!source.module) return null;

  const imports = await ctx.getImports(path);
  const violations: string[] = [];

  for (const imp of imports) {
    if (!imp.startsWith("src/")) continue;
    const targetModule = getModuleFromPath(imp);
    if (!targetModule || targetModule === source.module || targetModule === "core") continue;

    if (source.isBootstrap && !isModRootImport(imp)) {
      violations.push(`bootstrap-not-modroot:${targetModule}:${imp}`);
    } else if (!source.isBootstrap) {
      violations.push(`cross-module:${source.module}→${targetModule}:${imp}`);
    }
  }

  return violations.length > 0 ? violations : null;
}
```

### Step 3.6: `rules/module-isolation/llm.ts`

```ts
import { quickQuery } from "https://gist.githubusercontent.com/theTechGoose/68c8429d1564b36e02350df472a2bdd8/raw/claude-bot.ts";
import type { EntryTarget } from "../../types.ts";

const SYSTEM = `You are a code architecture advisor enforcing module isolation in a hexagonal architecture.

Rules:
- Modules can only import from themselves or core/
- Bootstrap can import any module but ONLY through its mod-root file
- Cross-module imports are forbidden — extract shared code to core/ instead

Given violations, suggest concise fixes (2-3 sentences).`;

export async function generateSuggestion(
  violations: string[],
  path: string,
  _target: EntryTarget,
): Promise<string> {
  const prompt = `File: ${path}
Violations:
${violations.map((v) => `  - ${v}`).join("\n")}

How should the developer fix these module isolation violations?`;

  return await quickQuery(prompt, {
    systemPrompt: SYSTEM,
    model: "claude-haiku-4-5-20251001",
    allowDangerouslySkipPermissions: true,
  });
}
```

---

### Step 3.7: `rules/poly-isolation/mod.ts`

Create directory `rules/poly-isolation/`.

```ts
import type { PipelineContext, EntryTarget } from "../../types.ts";
import { dirname } from "jsr:@std/path";

const SOURCE_EXTS = new Set(["ts", "tsx", "js", "jsx"]);

export async function check(
  path: string,
  target: EntryTarget,
  ctx: PipelineContext,
): Promise<string[] | null> {
  if (target === "folder" || !SOURCE_EXTS.has(target as string)) return null;

  const polyFeatures = ctx.files
    .filter((f) => f.split("/").pop()?.replace(/\.[^.]+$/, "") === "poly-mod")
    .map((f) => ({ dir: dirname(f), polyModPath: f }));

  const imports = await ctx.getImports(path);
  const violations: string[] = [];

  for (const imp of imports) {
    for (const poly of polyFeatures) {
      // Skip if the importing file is inside the poly dir
      if (path.startsWith(poly.dir + "/") || path === poly.dir) continue;
      // Violation if importing something inside the poly dir that isn't poly-mod
      if (
        imp.startsWith(poly.dir + "/") &&
        imp.split("/").pop()?.replace(/\.[^.]+$/, "") !== "poly-mod"
      ) {
        violations.push(`bypass:${poly.polyModPath}:${imp}`);
      }
    }
  }

  return violations.length > 0 ? violations : null;
}
```

### Step 3.8: `rules/poly-isolation/llm.ts`

```ts
import { quickQuery } from "https://gist.githubusercontent.com/theTechGoose/68c8429d1564b36e02350df472a2bdd8/raw/claude-bot.ts";
import type { EntryTarget } from "../../types.ts";

const SYSTEM = `You are a code architecture advisor enforcing polymorphic module isolation.

Rule: poly-mod files are the ONLY public surface for polymorphic features. External code must import from poly-mod, never from internal files within that feature directory.

Given bypass violations, suggest concise fixes (2-3 sentences).`;

export async function generateSuggestion(
  violations: string[],
  path: string,
  _target: EntryTarget,
): Promise<string> {
  const prompt = `File: ${path}
Violations:
${violations.map((v) => `  - ${v}`).join("\n")}

How should the developer fix these poly-mod bypass violations?`;

  return await quickQuery(prompt, {
    systemPrompt: SYSTEM,
    model: "claude-haiku-4-5-20251001",
    allowDangerouslySkipPermissions: true,
  });
}
```

---

### Step 3.9: `rules/dto-validation/mod.ts`

Create directory `rules/dto-validation/`.

```ts
import type { PipelineContext, EntryTarget } from "../../types.ts";

const SOURCE_EXTS = new Set(["ts", "tsx", "js", "jsx"]);

const VALIDATION_PATTERNS = [
  /\bz\.\w+/,
  /\b(?:parse|safeParse)\s*\(/,
  /\bvalidate\w*\s*\(/,
  /\bthrow\s+new\b/,
  /\bschema\b/i,
  /\.refine\s*\(/,
  /\bType\.\w+/,
  /\bv\.\w+\(/,
];

export async function check(
  path: string,
  target: EntryTarget,
  ctx: PipelineContext,
): Promise<string[] | null> {
  if (target === "folder" || !SOURCE_EXTS.has(target as string)) return null;
  if (!path.split("/").includes("dto")) return null;
  if (/\.(?:test|spec)\./.test(path)) return null;

  const content = await ctx.getFileContent(path);

  for (const pattern of VALIDATION_PATTERNS) {
    if (pattern.test(content)) return null;
  }

  return ["no-validation"];
}
```

### Step 3.10: `rules/dto-validation/llm.ts`

```ts
import { quickQuery } from "https://gist.githubusercontent.com/theTechGoose/68c8429d1564b36e02350df472a2bdd8/raw/claude-bot.ts";
import type { EntryTarget } from "../../types.ts";

const SYSTEM = `You are a code architecture advisor enforcing DTO validation rules.

Rule: Every DTO file must contain runtime validation logic — a schema (zod, valibot, typebox), a parse/validate call, or a throw on invalid input. Type-only DTOs are not enough because they disappear at runtime.

Given a DTO file without validation, suggest what to add. Be concise (2-3 sentences).`;

export async function generateSuggestion(
  violations: string[],
  path: string,
  _target: EntryTarget,
): Promise<string> {
  const prompt = `File: ${path}
Violation: ${violations[0]}

This DTO has no runtime validation. What should the developer add?`;

  return await quickQuery(prompt, {
    systemPrompt: SYSTEM,
    model: "claude-haiku-4-5-20251001",
    allowDangerouslySkipPermissions: true,
  });
}
```

---

### Step 3.11: `rules/barrel-discipline/mod.ts`

Create directory `rules/barrel-discipline/`.

```ts
import type { PipelineContext, EntryTarget } from "../../types.ts";

const SOURCE_EXTS = new Set(["ts", "tsx", "js", "jsx"]);

const BARREL_RE = /export\s+(?:\{[^}]*\}\s+from|(?:\*|\*\s+as\s+\w+)\s+from)\s+["'][^"']+["']/g;

export async function check(
  path: string,
  target: EntryTarget,
  ctx: PipelineContext,
): Promise<string[] | null> {
  if (target === "folder" || !SOURCE_EXTS.has(target as string)) return null;

  const baseName = path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
  if (baseName === "poly-mod" || baseName === "mod-root") return null;
  if (path.startsWith("src/bootstrap/")) return null;

  const content = await ctx.getFileContent(path);

  if (BARREL_RE.test(content)) return ["barrel-in-wrong-place"];

  return null;
}
```

### Step 3.12: `rules/barrel-discipline/llm.ts`

```ts
import { quickQuery } from "https://gist.githubusercontent.com/theTechGoose/68c8429d1564b36e02350df472a2bdd8/raw/claude-bot.ts";
import type { EntryTarget } from "../../types.ts";

const SYSTEM = `You are a code architecture advisor enforcing barrel export discipline.

Rule: Re-exports (export { x } from, export * from) are ONLY allowed in mod-root, poly-mod, or bootstrap files. All other files must export their own declarations directly.

Given a barrel violation, suggest where to move the re-exports. Be concise (2-3 sentences).`;

export async function generateSuggestion(
  violations: string[],
  path: string,
  _target: EntryTarget,
): Promise<string> {
  const prompt = `File: ${path}
Violation: ${violations[0]}

This file has re-exports that belong in a mod-root or poly-mod. What should the developer do?`;

  return await quickQuery(prompt, {
    systemPrompt: SYSTEM,
    model: "claude-haiku-4-5-20251001",
    allowDangerouslySkipPermissions: true,
  });
}
```

---

### Step 3.13: `rules/mod.ts`

Barrel that wires all rules into a single array.

```ts
import type { Rule } from "../types.ts";

import { check as structureCheck } from "./structure/mod.ts";
import { generateSuggestion as structureSuggest } from "./structure/llm.ts";

import { check as layerCheck } from "./layer-restrictions/mod.ts";
import { generateSuggestion as layerSuggest } from "./layer-restrictions/llm.ts";

import { check as moduleCheck } from "./module-isolation/mod.ts";
import { generateSuggestion as moduleSuggest } from "./module-isolation/llm.ts";

import { check as polyCheck } from "./poly-isolation/mod.ts";
import { generateSuggestion as polySuggest } from "./poly-isolation/llm.ts";

import { check as dtoCheck } from "./dto-validation/mod.ts";
import { generateSuggestion as dtoSuggest } from "./dto-validation/llm.ts";

import { check as barrelCheck } from "./barrel-discipline/mod.ts";
import { generateSuggestion as barrelSuggest } from "./barrel-discipline/llm.ts";

export const rules: Rule[] = [
  {
    name: "structure",
    description: "Validates file/folder placement against canonical-paths.json",
    check: structureCheck,
    generateSuggestion: structureSuggest,
  },
  {
    name: "layer-restrictions",
    description: "Enforces allowed layer-to-layer import directions",
    check: layerCheck,
    generateSuggestion: layerSuggest,
  },
  {
    name: "module-isolation",
    description: "Prevents cross-module imports outside core and mod-root",
    check: moduleCheck,
    generateSuggestion: moduleSuggest,
  },
  {
    name: "poly-isolation",
    description: "Ensures poly-mod is the only public surface for polymorphic features",
    check: polyCheck,
    generateSuggestion: polySuggest,
  },
  {
    name: "dto-validation",
    description: "Requires runtime validation in DTO files",
    check: dtoCheck,
    generateSuggestion: dtoSuggest,
  },
  {
    name: "barrel-discipline",
    description: "Restricts re-exports to mod-root, poly-mod, and bootstrap only",
    check: barrelCheck,
    generateSuggestion: barrelSuggest,
  },
];
```

**Verify:** `deno check rules/mod.ts`

---

## Phase 4 — Entry Point

### Step 4.1: `main.ts`

```ts
import { rules } from "./rules/mod.ts";
import { buildContext } from "./context.ts";
import { resolve, extname } from "jsr:@std/path";
import type { EntryResult } from "./types.ts";

// ANSI helpers
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

async function main() {
  const llmMode = Deno.args.includes("--llm");
  const positional = Deno.args.filter((a) => !a.startsWith("--"));
  const arg = positional[0];

  if (!arg) {
    console.error("Usage: shape-checker <path-to-project> [--llm]");
    console.error("  --llm  Generate AI-powered fix suggestions (requires claude CLI, cannot run inside a Claude session)");
    Deno.exit(2);
  }

  const targetDir = resolve(arg);
  console.log(`${BOLD}Scanning ${targetDir}...${RESET}`);
  if (llmMode) console.log(`${CYAN}LLM suggestions enabled${RESET}`);
  console.log();

  const ctx = await buildContext(targetDir);

  const entries = [
    ...ctx.dirs.map((p) => ({ path: p, target: "folder" as const })),
    ...ctx.files.map((p) => ({
      path: p,
      target: extname(p).slice(1) || "unknown",
    })),
  ];

  const results: EntryResult[] = [];

  for (const entry of entries) {
    for (const rule of rules) {
      const violations = await rule.check(entry.path, entry.target, ctx);
      if (violations !== null) {
        const suggestion = llmMode
          ? await rule.generateSuggestion(violations, entry.path, entry.target)
          : undefined;
        results.push({
          path: entry.path,
          target: entry.target,
          rule: rule.name,
          violations,
          suggestion,
        });
      }
    }
  }

  if (results.length === 0) {
    console.log(`${BOLD}${CYAN}All clear — no violations found.${RESET}`);
    Deno.exit(0);
  }

  // Group by rule
  const grouped = new Map<string, EntryResult[]>();
  for (const r of results) {
    const list = grouped.get(r.rule) ?? [];
    list.push(r);
    grouped.set(r.rule, list);
  }

  for (const [rule, items] of grouped) {
    console.log(`${BOLD}${RED}[${rule}]${RESET} — ${items.length} violation(s)\n`);
    for (const item of items) {
      console.log(`  ${YELLOW}${item.path}${RESET}`);
      for (const v of item.violations) {
        console.log(`    ${RED}• ${v}${RESET}`);
      }
      if (item.suggestion) {
        console.log(`    ${CYAN}→ ${item.suggestion}${RESET}`);
      }
      console.log();
    }
  }

  console.log(`${BOLD}${RED}${results.length} total violation(s) found.${RESET}`);
  Deno.exit(1);
}

main();
```

**Verify:** `deno check main.ts`

---

## Phase 5 — Ship

### Step 5.1: Type-check everything

```bash
deno check main.ts
```

### Step 5.2: Compile to binary

```bash
deno task compile
```

Produces `./shape-checker` binary.

### Step 5.3: Test run (static — works anywhere, including inside Claude sessions)

```bash
./shape-checker /path/to/your/project
```

Expected:
- Clean project → "All clear — no violations found." exit 0
- Violations → grouped colored output with violation codes, exit 1

### Step 5.4: Test run with LLM suggestions (plain terminal only — NOT inside a Claude session)

```bash
./shape-checker /path/to/your/project --llm
```

Same as above, but each violation also gets an AI-generated fix suggestion via the Claude Agent SDK. This spawns a `claude` subprocess — it **will fail if already running inside a Claude session** (nested sessions are not supported).
