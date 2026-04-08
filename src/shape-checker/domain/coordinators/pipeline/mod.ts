import { buildContext } from "@shape-checker/domain/data/filesystem/mod.ts";
import { Lsp } from "@shape-checker/domain/data/lsp/mod.ts";
import { LSP_CONFIG } from "@core/dto/lsp-config.ts";
import { extname } from "#std/path";
import type { EntryResult } from "@core/dto/types.ts";
import type { RuleDefinition } from "@core/dto/types.ts";

export async function runPipeline(
  targetDir: string,
  rules: RuleDefinition[],
  ignored: Set<string> = new Set(),
): Promise<EntryResult[]> {
  const t0 = performance.now();
  const ctx = await buildContext(targetDir, ignored);
  const tCtx = performance.now();
  console.error(`  [profile] buildContext: ${(tCtx - t0).toFixed(0)}ms (${ctx.files.length} files, ${ctx.dirs.length} dirs)`);

  const lsp = new Lsp(targetDir, LSP_CONFIG);
  try {
    await lsp.initialize();
    ctx.lsp = lsp;
  } catch {
    ctx.lsp = null;
  }
  const tLsp = performance.now();
  console.error(`  [profile] LSP init: ${(tLsp - tCtx).toFixed(0)}ms (${ctx.lsp ? "connected" : "failed"})`);

  const entries = [
    ...ctx.dirs.map((p) => ({ path: p, target: "folder" as const })),
    ...ctx.files.map((p) => ({
      path: p,
      target: extname(p).slice(1) || "unknown",
    })),
  ];

  const results: EntryResult[] = [];
  const ruleTimes = new Map<string, number>();

  try {
    for (const entry of entries) {
      for (const rule of rules) {
        const rStart = performance.now();
        const violations = await rule.check(entry.path, entry.target, ctx);
        ruleTimes.set(rule.name, (ruleTimes.get(rule.name) ?? 0) + (performance.now() - rStart));
        if (violations !== null) {
          results.push({
            path: entry.path,
            target: entry.target,
            rule: rule.name,
            violations,
          });
        }
      }
    }
  } finally {
    const tShutStart = performance.now();
    await lsp.shutdown();
    const tEnd = performance.now();
    console.error(`  [profile] LSP shutdown: ${(tEnd - tShutStart).toFixed(0)}ms`);
    console.error(`  [profile] Rules (${entries.length} entries):`);
    for (const [name, ms] of [...ruleTimes.entries()].sort((a, b) => b[1] - a[1])) {
      console.error(`    ${name}: ${ms.toFixed(0)}ms`);
    }
    console.error(`  [profile] Total: ${(tEnd - t0).toFixed(0)}ms`);
  }

  return results;
}
