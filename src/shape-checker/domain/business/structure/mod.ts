import SHAPE from "./canonical-paths.json" with { type: "json" };
import type { PipelineContext, EntryTarget } from "../../../../core/dto/types.ts";

const FORBIDDEN_DIRS = new Set((SHAPE as Record<string, unknown>)["$forbiddenDirNames"] as string[]);
const LOOSE_NAMES = new Set((SHAPE as Record<string, unknown>)["$looseFileNames"] as string[]);

type ShapeNode = Record<string, unknown>;

export function resolveNode(segments: string[]): ShapeNode | null {
  let current: unknown = SHAPE;
  for (const seg of segments) {
    if (typeof current !== "object" || current === null) return null;
    const node = current as ShapeNode;

    const fixedKey = Object.keys(node).find(
      (k) => !k.startsWith("$") && !k.startsWith("<") && k === seg && typeof node[k] === "object",
    );
    if (fixedKey) {
      current = node[fixedKey];
      continue;
    }

    const descriptor = Object.keys(node).find(
      (k) => k.startsWith("<") && k.endsWith(">") && typeof node[k] === "object",
    );
    if (descriptor) {
      current = node[descriptor];
      continue;
    }

    return null;
  }
  return typeof current === "object" && current !== null ? (current as ShapeNode) : null;
}

export function getRequiredFiles(node: ShapeNode): string[] {
  return Object.keys(node).filter(
    (k) => typeof node[k] === "string" && !k.startsWith("$") && !k.startsWith("<"),
  );
}

export function getExpectedAt(node: ShapeNode): {
  desc: string;
  folders: string[];
  files: { name: string; desc: string }[];
  descriptor: string | null;
} {
  const desc = (node["$desc"] as string) ?? "";
  const folders: string[] = [];
  const files: { name: string; desc: string }[] = [];
  let descriptor: string | null = null;

  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith("$")) continue;
    if (k.startsWith("<") && k.endsWith(">")) {
      descriptor = k;
      continue;
    }
    if (typeof v === "object") folders.push(k);
    else if (typeof v === "string") files.push({ name: k, desc: v });
  }

  return { desc, folders, files, descriptor };
}

export async function check(
  path: string,
  target: EntryTarget,
  ctx: PipelineContext,
): Promise<string[] | null> {
  const segments = path.split("/");
  const name = segments[segments.length - 1];

  if (target === "folder") {
    const node = resolveNode(segments);
    const violations: string[] = [];

    if (node === null) violations.push("not-allowed");
    if (FORBIDDEN_DIRS.has(name)) violations.push(`forbidden:${name}`);
    if (name === "core" && path !== "src/core") violations.push("forbidden:core");
    if (LOOSE_NAMES.has(name)) violations.push(`loose:${name}`);

    if (node !== null) {
      const required = getRequiredFiles(node);
      for (const key of required) {
        const found = ctx.files.some(
          (f) => f.startsWith(path + "/") && f.split("/").pop()?.replace(/\.[^.]+$/, "") === key,
        );
        if (!found) violations.push(`missing-file:${key}`);
      }
    }

    return violations.length > 0 ? violations : null;
  }

  if (!path.includes("/")) return null;

  const parentSegs = segments.slice(0, -1);
  const parentNode = resolveNode(parentSegs);
  if (parentNode === null) return ["not-allowed"];

  const baseName = name.replace(/\.[^.]+$/, "");
  if (LOOSE_NAMES.has(baseName)) return [`loose:${baseName}`];

  return null;
}

export const SYSTEM_PROMPT = `You are a code architecture advisor. The project follows a hexagonal/modular architecture defined in a canonical-paths.json spec. Given structural violations for a file or folder, produce a concise, actionable fix suggestion (2-3 sentences max). Reference the spec's expected structure when relevant.`;

export function buildPrompt(
  violations: string[],
  path: string,
  target: EntryTarget,
): string {
  return `Path: ${path} (${target})
Violations: ${JSON.stringify(violations)}

Parent expected structure: ${JSON.stringify(
    (() => {
      const parentSegs = path.split("/").slice(0, -1);
      const parentNode = resolveNode(parentSegs);
      return parentNode ? getExpectedAt(parentNode) : "unknown parent";
    })(),
  )}

What should the developer do to fix these violations?`;
}
