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
