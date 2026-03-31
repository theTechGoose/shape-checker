import { quickQuery } from "../../llm.ts";
import type { EntryTarget } from "../../types.ts";

const SYSTEM = `You are a code architecture advisor enforcing polymorphic module isolation.

Rule: poly-mod files are the ONLY public surface for polymorphic features. External code must import from poly-mod, never from internal files within that feature directory.

Given bypass violations, suggest concise fixes (2-3 sentences).`;

export async function generateSuggestion(
  violations: string[],
  path: string,
  _target: EntryTarget,
): Promise<string> {
  const prompt = `File: ${path}
Violations:
${violations.map((v) => `  - ${v}`).join("\n")}

How should the developer fix these poly-mod bypass violations?`;

  return await quickQuery(prompt, {
    systemPrompt: SYSTEM,
    model: "claude-haiku-4-5-20251001",
  });
}
