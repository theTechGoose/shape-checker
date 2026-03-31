import { quickQuery } from "../../llm.ts";
import { resolveNode, getExpectedAt } from "./mod.ts";
import type { EntryTarget } from "../../types.ts";

const SYSTEM = `You are a code architecture advisor. The project follows a hexagonal/modular architecture defined in a canonical-paths.json spec. Given structural violations for a file or folder, produce a concise, actionable fix suggestion (2-3 sentences max). Reference the spec's expected structure when relevant.`;

export async function generateSuggestion(
  violations: string[],
  path: string,
  target: EntryTarget,
): Promise<string> {
  const prompt = `Path: ${path} (${target})
Violations: ${JSON.stringify(violations)}

Parent expected structure: ${JSON.stringify(
    (() => {
      const parentSegs = path.split("/").slice(0, -1);
      const parentNode = resolveNode(parentSegs);
      return parentNode ? getExpectedAt(parentNode) : "unknown parent";
    })(),
  )}

What should the developer do to fix these violations?`;

  return await quickQuery(prompt, {
    systemPrompt: SYSTEM,
    model: "claude-haiku-4-5-20251001",
  });
}
