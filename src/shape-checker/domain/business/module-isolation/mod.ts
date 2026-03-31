import { classifyFile, getModuleFromPath, isModRootImport } from "../../../../core/business/classify/mod.ts";
import type { PipelineContext, EntryTarget } from "../../../../core/dto/types.ts";

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

export const SYSTEM_PROMPT = `You are a code architecture advisor enforcing module isolation in a hexagonal architecture.

Rules:
- Modules can only import from themselves or core/
- Bootstrap can import any module but ONLY through its mod-root file
- Cross-module imports are forbidden — extract shared code to core/ instead

Given violations, suggest concise fixes (2-3 sentences).`;

export function buildPrompt(
  violations: string[],
  path: string,
  _target: EntryTarget,
): string {
  return `File: ${path}
Violations:
${violations.map((v) => `  - ${v}`).join("\n")}

How should the developer fix these module isolation violations?`;
}
