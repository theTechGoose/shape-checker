import { assertEquals } from "#std/assert";
import { resolveNode, getRequiredFiles, getExpectedAt, check } from "./mod.ts";
import type { PipelineContext } from "@/core/dto/types.ts";

function makeCtx(files: string[], dirs: string[]): PipelineContext {
  return {
    targetDir: "/fake",
    files,
    dirs,
    getFileContent: async () => "",
    getImports: async () => [],
    lsp: null,
  };
}

Deno.test("resolveNode — valid path", () => {
  const node = resolveNode(["src", "bootstrap"]);
  assertEquals(node !== null, true);
});

Deno.test("resolveNode — invalid path", () => {
  const node = resolveNode(["nonexistent"]);
  assertEquals(node, null);
});

Deno.test("getRequiredFiles — bootstrap", () => {
  const node = resolveNode(["src", "bootstrap"]);
  const required = getRequiredFiles(node!);
  assertEquals(required.includes("mod"), true);
  assertEquals(required.includes("config"), true);
});

Deno.test("getExpectedAt — returns structure info", () => {
  const node = resolveNode(["src", "bootstrap"]);
  const expected = getExpectedAt(node!);
  assertEquals(typeof expected.desc, "string");
});

Deno.test("feature folder with only mod.ts (no test.ts) should be flagged", async () => {
  // Simulate a feature folder that only has mod.ts — no test.ts
  // This should NOT match variant 1 (requires mod+test) or variant 2 (requires base+implementations+poly-mod)
  const ctx = makeCtx(
    ["src/mymod/domain/business/myfeat/mod.ts"],
    [
      "src",
      "src/mymod",
      "src/mymod/domain",
      "src/mymod/domain/business",
      "src/mymod/domain/business/myfeat",
    ],
  );

  const node = resolveNode(
    ["src", "mymod", "domain", "business", "myfeat"],
    ctx,
  );
  console.log("resolveNode for myfeat:", JSON.stringify(node));

  const result = await check(
    "src/mymod/domain/business/myfeat",
    "folder",
    ctx,
  );
  console.log("check result for myfeat folder:", JSON.stringify(result));

  assertEquals(result !== null, true, "feature folder with only mod.ts should be flagged — doesn't match any variant");
});
