import type { PipelineContext, EntryTarget } from "../../../../core/dto/types.ts";

const SOURCE_EXTS = new Set(["ts", "tsx", "js", "jsx"]);

const VALIDATION_PATTERNS = [
  /\bz\.\w+/,
  /\b(?:parse|safeParse)\s*\(/,
  /\bvalidate\w*\s*\(/,
  /\bthrow\s+new\b/,
  /\bschema\b/i,
  /\.refine\s*\(/,
  /\bType\.\w+/,
  /\bv\.\w+\(/,
];

export async function check(
  path: string,
  target: EntryTarget,
  ctx: PipelineContext,
): Promise<string[] | null> {
  if (target === "folder" || !SOURCE_EXTS.has(target as string)) return null;
  if (!path.split("/").includes("dto")) return null;
  if (/\.(?:test|spec)\./.test(path)) return null;

  const content = await ctx.getFileContent(path);

  for (const pattern of VALIDATION_PATTERNS) {
    if (pattern.test(content)) return null;
  }

  return ["no-validation"];
}

export const SYSTEM_PROMPT = `You are a code architecture advisor enforcing DTO validation rules.

Rule: Every DTO file must contain runtime validation logic — a schema (zod, valibot, typebox), a parse/validate call, or a throw on invalid input. Type-only DTOs are not enough because they disappear at runtime.

Given a DTO file without validation, suggest what to add. Be concise (2-3 sentences).`;

export function buildPrompt(
  violations: string[],
  path: string,
  _target: EntryTarget,
): string {
  return `File: ${path}
Violation: ${violations[0]}

This DTO has no runtime validation. What should the developer add?`;
}
