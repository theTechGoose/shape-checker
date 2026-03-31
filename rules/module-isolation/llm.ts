import { quickQuery } from "../../llm.ts";
import type { EntryTarget } from "../../types.ts";

const SYSTEM = `You are a code architecture advisor enforcing module isolation in a hexagonal architecture.

Rules:
- Modules can only import from themselves or core/
- Bootstrap can import any module but ONLY through its mod-root file
- Cross-module imports are forbidden — extract shared code to core/ instead

Given violations, suggest concise fixes (2-3 sentences).`;

export async function generateSuggestion(
  violations: string[],
  path: string,
  _target: EntryTarget,
): Promise<string> {
  const prompt = `File: ${path}
Violations:
${violations.map((v) => `  - ${v}`).join("\n")}

How should the developer fix these module isolation violations?`;

  return await quickQuery(prompt, {
    systemPrompt: SYSTEM,
    model: "claude-haiku-4-5-20251001",
  });
}
