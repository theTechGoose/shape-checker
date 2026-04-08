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

Deno.test("getRequiredFiles — excludes keys ending with ?", () => {
  const node = { "mod": "required", "config?": "optional", "$desc": "test" } as Record<string, unknown>;
  const required = getRequiredFiles(node);
  assertEquals(required.includes("mod"), true);
  assertEquals(required.includes("config?"), false);
  assertEquals(required.includes("config"), false);
});

Deno.test("check — folder with optional file present has no missing-file violation", async () => {
  const ctx = makeCtx(
    ["src/bootstrap/mod.ts", "src/bootstrap/config.ts", "src/bootstrap/env.ts"],
    ["src", "src/bootstrap"],
  );
  const result = await check("src/bootstrap", "folder", ctx);
  assertEquals(result, null);
});

Deno.test("check — folder with optional file absent has no missing-file violation", async () => {
  const ctx = makeCtx(
    ["src/bootstrap/mod.ts", "src/bootstrap/config.ts"],
    ["src", "src/bootstrap"],
  );
  const result = await check("src/bootstrap", "folder", ctx);
  assertEquals(result, null);
});

Deno.test("check — file matching optional key is not flagged as not-allowed", async () => {
  const ctx = makeCtx(
    ["src/mymod/domain/coordinators/myproc/mod.ts", "src/mymod/domain/coordinators/myproc/template.ts"],
    ["src", "src/mymod", "src/mymod/domain", "src/mymod/domain/coordinators", "src/mymod/domain/coordinators/myproc"],
  );
  const result = await check("src/mymod/domain/coordinators/myproc/template.ts", "ts", ctx);
  assertEquals(result, null);
});

Deno.test("check — fixture .json file is allowed", async () => {
  const ctx = makeCtx(
    ["fixtures/seeds/users.json"],
    ["fixtures", "fixtures/seeds"],
  );
  const result = await check("fixtures/seeds/users.json", "json", ctx);
  assertEquals(result, null);
});

Deno.test("check — fixture non-.json file is flagged with wrong-extension", async () => {
  const ctx = makeCtx(
    ["fixtures/seeds/users.ts"],
    ["fixtures", "fixtures/seeds"],
  );
  const result = await check("fixtures/seeds/users.ts", "ts", ctx);
  assertEquals(result !== null, true);
  assertEquals(result![0].includes("Wrong file extension"), true);
});

Deno.test("getExpectedAt — strips ? from file names", () => {
  const node = { "mod": "required file", "config?": "optional file", "$desc": "test" } as Record<string, unknown>;
  const expected = getExpectedAt(node);
  const names = expected.files.map((f) => f.name);
  assertEquals(names.includes("mod"), true);
  assertEquals(names.includes("config"), true);
  assertEquals(names.includes("config?"), false);
});
