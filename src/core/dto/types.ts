import { z } from "npm:zod";

export type EntryTarget = string | "folder";

export const RuleSchema = z.object({
  name: z.string(),
  description: z.string(),
});

export interface Rule {
  name: string;
  description: string;
  check(path: string, target: EntryTarget, ctx: PipelineContext): Promise<string[] | null>;
  generateSuggestion(violations: string[], path: string, target: EntryTarget): Promise<string>;
}

export const PipelineContextSchema = z.object({
  targetDir: z.string(),
  files: z.array(z.string()),
  dirs: z.array(z.string()),
});

export interface PipelineContext {
  targetDir: string;
  files: string[];
  dirs: string[];
  getFileContent(rel: string): Promise<string>;
  getImports(rel: string): Promise<string[]>;
}

export const EntryResultSchema = z.object({
  path: z.string(),
  target: z.string(),
  rule: z.string(),
  violations: z.array(z.string()),
  suggestion: z.string().optional(),
});

export interface EntryResult {
  path: string;
  target: EntryTarget;
  rule: string;
  violations: string[];
  suggestion?: string;
}
