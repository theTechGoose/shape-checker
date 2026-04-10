import type { EntryResult } from "@core/dto/types.ts";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

export function parseArgs(args: string[]): { dir: string; module: string | null; suggest: boolean } {
  const suggest = !args.includes("--no-suggest");

  const moduleIndex = args.indexOf("--module");
  const module = moduleIndex !== -1 && args[moduleIndex + 1] ? args[moduleIndex + 1] : null;

  // First positional arg (not a flag or flag value) as dir
  const flagValues = new Set<number>();
  if (moduleIndex !== -1) flagValues.add(moduleIndex + 1);
  const positional = args.find((a, i) => !a.startsWith("--") && !flagValues.has(i));

  return { dir: positional ?? ".", module, suggest };
}

export function printHeader(targetDir: string): void {
  console.log(`${BOLD}Scanning ${targetDir}...${RESET}`);
  console.log();
}

export function printResults(results: EntryResult[]): void {
  if (results.length === 0) {
    console.log(`${BOLD}${CYAN}All clear — no violations found.${RESET}`);
    return;
  }

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
}
