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
