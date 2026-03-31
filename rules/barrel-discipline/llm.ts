import { quickQuery } from "../../llm.ts";
import type { EntryTarget } from "../../types.ts";

const SYSTEM = `You are a code architecture advisor enforcing barrel export discipline.

Rule: Re-exports (export { x } from, export * from) are ONLY allowed in mod-root, poly-mod, or bootstrap files. All other files must export their own declarations directly.

Given a barrel violation, suggest where to move the re-exports. Be concise (2-3 sentences).`;

export async function generateSuggestion(
  violations: string[],
  path: string,
  _target: EntryTarget,
): Promise<string> {
  const prompt = `File: ${path}
Violation: ${violations[0]}

This file has re-exports that belong in a mod-root or poly-mod. What should the developer do?`;

  return await quickQuery(prompt, {
    systemPrompt: SYSTEM,
    model: "claude-haiku-4-5-20251001",
  });
}
