import { resolve } from "jsr:@std/path";
import { rules, runPipeline, parseArgs, printUsage, printHeader, printResults } from "../shape-checker/mod-root.ts";

const { targetDir: rawDir, llmMode } = parseArgs(Deno.args);

if (!rawDir) {
  printUsage();
  Deno.exit(2);
}

const targetDir = resolve(rawDir);
printHeader(targetDir, llmMode);

const results = await runPipeline(targetDir, rules, llmMode);
printResults(results);

Deno.exit(results.length > 0 ? 1 : 0);
