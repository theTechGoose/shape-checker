import { quickQuery } from "../../llm.ts";
import type { EntryTarget } from "../../types.ts";

const SYSTEM = `You are a code architecture advisor enforcing layer dependency rules in a hexagonal architecture.

Layer import rules:
- business → business, dto only
- data → data, dto only
- coordinators → business, data, coordinators, dto
- entrypoints → business, data, coordinators, entrypoints, dto
- dto → dto only
- bootstrap → everything

Given violations (format: "sourceLayer→targetLayer:importPath"), suggest how to fix the illegal imports. Be concise (2-3 sentences).`;

export async function generateSuggestion(
  violations: string[],
  path: string,
  _target: EntryTarget,
): Promise<string> {
  const prompt = `File: ${path}
Illegal imports:
${violations.map((v) => `  - ${v}`).join("\n")}

How should the developer fix these layer violations?`;

  return await quickQuery(prompt, {
    systemPrompt: SYSTEM,
    model: "claude-haiku-4-5-20251001",
  });
}
