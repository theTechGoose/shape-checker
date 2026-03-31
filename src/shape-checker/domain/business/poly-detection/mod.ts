import type { PipelineContext, EntryTarget } from "../../../../core/dto/types.ts";

export async function check(
  path: string,
  target: EntryTarget,
  ctx: PipelineContext,
): Promise<string[] | null> {
  if (target !== "folder") return null;
  if (!path.match(/^src\/[^/]+\/domain\/business$/)) return null;

  const hasPolyMod = ctx.files.some(
    (f) => f.startsWith(path + "/") &&
      f.split("/").pop()?.replace(/\.[^.]+$/, "") === "poly-mod",
  );
  if (hasPolyMod) return null;

  if (!ctx.lsp) return null;

  const pathDepth = path.split("/").length;
  const featureDirs = ctx.dirs
    .filter((d) => d.startsWith(path + "/") && d.split("/").length === pathDepth + 1)
    .map((d) => d.split("/").pop()!);

  if (featureDirs.length < 3) return null;

  const siblingExports = await ctx.lsp.getSiblingExportSignatures(path, featureDirs);

  // Count which export names appear across siblings
  const exportNameDirs = new Map<string, string[]>();
  for (const [dir, exports] of siblingExports) {
    for (const exp of exports) {
      const dirs = exportNameDirs.get(exp.name) ?? [];
      dirs.push(dir);
      exportNameDirs.set(exp.name, dirs);
    }
  }

  // Find names exported by 3+ siblings
  const candidates = [...exportNameDirs.entries()]
    .filter(([_, dirs]) => dirs.length >= 3);

  if (candidates.length === 0) return null;

  // Verify type compatibility for each candidate
  const confirmed: string[] = [];

  for (const [name, dirs] of candidates) {
    const signatures: string[] = [];
    for (const dir of dirs) {
      const modPath = `${path}/${dir}/mod.ts`;
      const sig = await ctx.lsp.getSymbolType(modPath, name);
      if (sig) signatures.push(sig);
    }

    if (signatures.length >= 3 && areSignaturesCompatible(signatures)) {
      confirmed.push(name);
    }
  }

  if (confirmed.length === 0) return null;

  return [`missing-poly-mod:${confirmed.join(",")}`];
}

function areSignaturesCompatible(signatures: string[]): boolean {
  const normalized = signatures.map(normalizeSignature);
  const first = normalized[0];
  return normalized.every((sig) => sig === first);
}

function normalizeSignature(sig: string): string {
  return sig
    .replace(/\s+/g, " ")
    .replace(/\b\w+:/g, ":")
    .trim();
}

export const SYSTEM_PROMPT = `You are a code architecture advisor detecting missing polymorphic modules.

Rule: When 3+ sibling features under a business/ directory export functions with the same names and compatible type signatures, they should be consolidated behind a poly-mod.ts file. This enables clean polymorphic dispatch and enforces a consistent interface.

Given a detection of missing poly-mod, suggest how to create one. Be concise (2-3 sentences).`;

export function buildPrompt(
  violations: string[],
  path: string,
  _target: EntryTarget,
): string {
  return `Directory: ${path}
Detection: ${violations[0]}

Multiple sibling features export the same functions with compatible signatures. How should the developer create a poly-mod.ts?`;
}
