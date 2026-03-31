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
