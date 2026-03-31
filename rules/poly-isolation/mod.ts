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
