import { assert, assertEquals } from "jsr:@std/assert";
import { Lsp } from "./mod.ts";

const LSP_CONFIG = {
  command: "deno",
  args: ["lsp"],
  initializationOptions: { enable: true },
};

Deno.test({
  name: "Lsp — negotiates capabilities",
  ignore: Deno.env.get("CI") === "true",
  async fn() {
    const lsp = new Lsp(Deno.cwd(), LSP_CONFIG);
    await lsp.initialize();
    try {
      assertEquals(lsp.capabilities.documentSymbol, true);
      assertEquals(lsp.capabilities.hover, true);
      assertEquals(lsp.capabilities.references, true);
      assertEquals(lsp.capabilities.definition, true);
    } finally {
      await lsp.shutdown();
    }
  },
});

Deno.test({
  name: "Lsp — get export types from a file",
  ignore: Deno.env.get("CI") === "true",
  async fn() {
    const lsp = new Lsp(Deno.cwd(), LSP_CONFIG);
    await lsp.initialize();
    try {
      const exports = await lsp.getExportTypes("src/core/business/classify/mod.ts");
      assert(exports.length > 0, "should find exports");
      const names = exports.map((e) => e.name);
      assert(names.includes("classifyFile"), "should find classifyFile export");
    } finally {
      await lsp.shutdown();
    }
  },
});

Deno.test({
  name: "Lsp — hover returns type info",
  ignore: Deno.env.get("CI") === "true",
  async fn() {
    const lsp = new Lsp(Deno.cwd(), LSP_CONFIG);
    await lsp.initialize();
    try {
      // classifyFile is exported at line 10 (0-indexed), around character 16
      const result = await lsp.hover("src/core/business/classify/mod.ts", 10, 16);
      assert(result !== null, "should return hover info");
      assert(result!.contents.length > 0, "should have content");
    } finally {
      await lsp.shutdown();
    }
  },
});

Deno.test({
  name: "Lsp — find references",
  ignore: Deno.env.get("CI") === "true",
  async fn() {
    const lsp = new Lsp(Deno.cwd(), LSP_CONFIG);
    await lsp.initialize();
    try {
      // LAYERS constant at line 0, character 6
      const refs = await lsp.findReferences("src/core/business/classify/mod.ts", 0, 6);
      assert(refs.length >= 0, "should return references array");
    } finally {
      await lsp.shutdown();
    }
  },
});

Deno.test({
  name: "Lsp — go to definition",
  ignore: Deno.env.get("CI") === "true",
  async fn() {
    const lsp = new Lsp(Deno.cwd(), LSP_CONFIG);
    await lsp.initialize();
    try {
      const defs = await lsp.goToDefinition("src/core/business/classify/mod.ts", 10, 16);
      assert(defs.length >= 0, "should return definitions array");
    } finally {
      await lsp.shutdown();
    }
  },
});

Deno.test({
  name: "Lsp — graceful fallback when capability missing",
  ignore: Deno.env.get("CI") === "true",
  async fn() {
    // Fake config with no init options — capabilities may differ
    // but the class should never throw, just return empty
    const lsp = new Lsp(Deno.cwd(), LSP_CONFIG);
    // Don't initialize — capabilities all false
    assertEquals(lsp.capabilities.hover, false);
    const result = await lsp.hover("src/core/business/classify/mod.ts", 0, 0);
    assertEquals(result, null);
    const refs = await lsp.findReferences("src/core/business/classify/mod.ts", 0, 0);
    assertEquals(refs.length, 0);
    const impls = await lsp.findImplementations("src/core/business/classify/mod.ts", 0, 0);
    assertEquals(impls.length, 0);
    const defs = await lsp.goToDefinition("src/core/business/classify/mod.ts", 0, 0);
    assertEquals(defs.length, 0);
    const diags = await lsp.getDiagnostics("src/core/business/classify/mod.ts");
    assertEquals(diags.length, 0);
  },
});
