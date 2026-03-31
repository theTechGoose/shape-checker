import { buildContext } from "../../data/filesystem/mod.ts";
import { quickQuery } from "../../data/llm/mod.ts";
import { extname } from "jsr:@std/path";
import type { EntryResult } from "../../../../core/dto/types.ts";
import type { RuleDefinition } from "../../business/poly-mod.ts";

export async function runPipeline(
  targetDir: string,
  rules: RuleDefinition[],
  llmMode: boolean,
): Promise<EntryResult[]> {
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
        let suggestion: string | undefined;
        if (llmMode) {
          const prompt = rule.buildPrompt(violations, entry.path, entry.target);
          suggestion = await quickQuery(prompt, {
            systemPrompt: rule.systemPrompt,
            model: "claude-haiku-4-5-20251001",
          });
        }
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

  return results;
}
