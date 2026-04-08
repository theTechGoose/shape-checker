import { resolve, join } from "#std/path";
import { rules, runPipeline, parseArgs, printHeader, printResults } from "@shape-checker/mod-root.ts";
import { findGitRoot, readWorkspaceMembers, getIgnoredPaths } from "@shape-checker/domain/data/project/mod.ts";
import type { EntryResult } from "@core/dto/types.ts";

console.log("hello world");

const { dir } = parseArgs(Deno.args);

const gitRoot = dir ? resolve(dir) : await findGitRoot();
const members = await readWorkspaceMembers(gitRoot);
const ignoredPaths = await getIgnoredPaths(gitRoot);

const allResults: EntryResult[] = [];

if (members) {
  for (const member of members) {
    const memberDir = resolve(join(gitRoot, member));
    const prefix = member + "/";
    const memberIgnored = new Set<string>();
    for (const p of ignoredPaths) {
      if (p.startsWith(prefix)) {
        memberIgnored.add(p.slice(prefix.length));
      }
    }
    printHeader(memberDir);
    const results = await runPipeline(memberDir, rules, memberIgnored);
    allResults.push(...results);
  }
} else {
  printHeader(gitRoot);
  const results = await runPipeline(gitRoot, rules, ignoredPaths);
  allResults.push(...results);
}

printResults(allResults);

Deno.exit(allResults.length > 0 ? 1 : 0);
