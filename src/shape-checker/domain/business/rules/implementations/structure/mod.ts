import SHAPE from "@assets/canonical-paths.json" with { type: "json" };
import type { PipelineContext, EntryTarget } from "@/core/dto/types.ts";

const FORBIDDEN_DIRS = new Set(
  (SHAPE as Record<string, unknown>)["$forbiddenDirNames"] as string[],
);
const LOOSE_NAMES = new Set(
  (SHAPE as Record<string, unknown>)["$looseFileNames"] as string[],
);
const ROOT_FILES = new Set(
  ((SHAPE as Record<string, unknown>)["$rootFiles"] as string[]) ?? [],
);

type ShapeNode = Record<string, unknown>;

function isNodeLike(v: unknown): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNodeOrArray(v: unknown): boolean {
  return isNodeLike(v) || Array.isArray(v);
}

function resolveArrayVariant(
  variants: unknown[],
  dirPath: string,
  ctx: PipelineContext,
): ShapeNode | null {
  for (const variant of variants) {
    if (!isNodeLike(variant)) continue;
    const node = variant as ShapeNode;

    const fixedKeys = Object.entries(node).filter(
      ([k]) => !k.startsWith("$") && !k.startsWith("<"),
    );

    const allMatch = fixedKeys.every(([k, v]) => {
      if (isNodeOrArray(v)) {
        return ctx.dirs.includes(dirPath + "/" + k);
      }
      return ctx.files.some(
        (f) =>
          f.startsWith(dirPath + "/") &&
          f.split("/").length === dirPath.split("/").length + 1 &&
          f
            .split("/")
            .pop()
            ?.replace(/\.[^.]+$/, "") === k,
      );
    });

    if (allMatch) return node;
  }

  return null;
}

export function resolveNode(
  segments: string[],
  ctx?: PipelineContext,
): ShapeNode | null {
  let current: unknown = SHAPE;
  const pathSoFar: string[] = [];

  for (const seg of segments) {
    if (!isNodeLike(current)) return null;
    const node = current as ShapeNode;

    const fixedKey = Object.keys(node).find(
      (k) =>
        !k.startsWith("$") &&
        !k.startsWith("<") &&
        k === seg &&
        isNodeOrArray(node[k]),
    );
    if (fixedKey) {
      current = node[fixedKey];
      if (Array.isArray(current)) {
        if (!ctx) return null;
        current = resolveArrayVariant(
          current,
          [...pathSoFar, seg].join("/"),
          ctx,
        );
        if (!current) return null;
      }
      pathSoFar.push(seg);
      continue;
    }

    const descriptor = Object.keys(node).find(
      (k) => k.startsWith("<") && k.endsWith(">") && isNodeOrArray(node[k]),
    );
    if (descriptor) {
      current = node[descriptor];
      if (Array.isArray(current)) {
        if (!ctx) return null;
        current = resolveArrayVariant(
          current,
          [...pathSoFar, seg].join("/"),
          ctx,
        );
        if (!current) return null;
      }
      pathSoFar.push(seg);
      continue;
    }

    return null;
  }
  return isNodeLike(current) ? (current as ShapeNode) : null;
}

export function getRequiredFiles(node: ShapeNode): string[] {
  return Object.keys(node).filter(
    (k) =>
      typeof node[k] === "string" && !k.startsWith("$") && !k.startsWith("<") && !k.endsWith("?"),
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
    else if (typeof v === "string") files.push({ name: k.endsWith("?") ? k.slice(0, -1) : k, desc: v });
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
    // Check if parent has $ignore: "*"
    if (segments.length > 1) {
      const parentSegs = segments.slice(0, -1);
      const parentNode = resolveNode(parentSegs, ctx);
      if (parentNode && parentNode["$ignore"] === "*") return null;
    }

    const node = resolveNode(segments, ctx);
    const violations: string[] = [];

    if (node === null) violations.push("This folder is not allowed by the project structure spec");
    if (FORBIDDEN_DIRS.has(name)) violations.push(`"${name}" is a forbidden directory name — use a more specific name`);
    if (name === "core" && path !== "src/core")
      violations.push("Only src/core can be named \"core\" — rename this folder");
    if (LOOSE_NAMES.has(name)) violations.push(`"${name}" is a loose/vague name — use a more specific name`);

    if (node !== null) {
      const required = getRequiredFiles(node);
      for (const key of required) {
        const found = ctx.files.some(
          (f) =>
            f.startsWith(path + "/") &&
            f
              .split("/")
              .pop()
              ?.replace(/\.[^.]+$/, "") === key,
        );
        if (!found) violations.push(`Missing required file "${key}" in this folder`);
      }
    }

    return violations.length > 0 ? violations : null;
  }

  const baseName = name.replace(/\.[^.]+$/, "");
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";

  // Root-level files: check against $rootFiles allowlist
  if (segments.length === 1) {
    if (ROOT_FILES.has(baseName) || ROOT_FILES.has(name)) return null;
    return ["This file is not allowed at the project root"];
  }

  const parentSegs = segments.slice(0, -1);
  const parentNode = resolveNode(parentSegs, ctx);
  if (parentNode === null) return ["This file is not allowed here by the project structure spec"];

  // $ignore: "*" means all children are allowed
  if (parentNode["$ignore"] === "*") return null;

  if (LOOSE_NAMES.has(baseName)) return [`"${baseName}" is a loose/vague name — use a more specific name`];

  // Check if this specific file is allowed by the parent node
  const matchesFixed = Object.entries(parentNode).some(
    ([k, v]) =>
      typeof v === "string" &&
      !k.startsWith("$") &&
      !k.startsWith("<") &&
      (k === baseName || (k.endsWith("?") && k.slice(0, -1) === baseName)),
  );
  if (matchesFixed) {
    const allowedExts = parentNode["$extensions"] as string[] | undefined;
    if (allowedExts && !allowedExts.includes(ext)) {
      return [`Wrong file extension "${ext}" — only ${allowedExts.join(", ")} files are allowed here`];
    }
    return null;
  }

  const matchesDescriptor = Object.keys(parentNode).some(
    (k) =>
      k.startsWith("<") && k.endsWith(">") && typeof parentNode[k] === "string",
  );
  if (matchesDescriptor) {
    const allowedExts = parentNode["$extensions"] as string[] | undefined;
    if (allowedExts && !allowedExts.includes(ext)) {
      return [`Wrong file extension "${ext}" — only ${allowedExts.join(", ")} files are allowed here`];
    }
    return null;
  }

  return ["This file is not allowed here by the project structure spec"];
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
