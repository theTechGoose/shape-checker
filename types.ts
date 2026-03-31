export type EntryTarget = string | "folder";

export interface Rule {
  name: string;
  description: string;
  check(path: string, target: EntryTarget, ctx: PipelineContext): Promise<string[] | null>;
  generateSuggestion(violations: string[], path: string, target: EntryTarget): Promise<string>;
}

export interface PipelineContext {
  targetDir: string;
  files: string[];
  dirs: string[];
  getFileContent(rel: string): Promise<string>;
  getImports(rel: string): Promise<string[]>;
}

export interface EntryResult {
  path: string;
  target: EntryTarget;
  rule: string;
  violations: string[];
  suggestion?: string;
}
