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
