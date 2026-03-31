import type { PipelineContext, EntryTarget } from "../../../../core/dto/types.ts";
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
      if (path.startsWith(poly.dir + "/") || path === poly.dir) continue;
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

export const SYSTEM_PROMPT = `You are a code architecture advisor enforcing polymorphic module isolation.

Rule: poly-mod files are the ONLY public surface for polymorphic features. External code must import from poly-mod, never from internal files within that feature directory.

Given bypass violations, suggest concise fixes (2-3 sentences).`;

export function buildPrompt(
  violations: string[],
  path: string,
  _target: EntryTarget,
): string {
  return `File: ${path}
Violations:
${violations.map((v) => `  - ${v}`).join("\n")}

How should the developer fix these poly-mod bypass violations?`;
}
