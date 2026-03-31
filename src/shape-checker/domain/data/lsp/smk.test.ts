import { assert, assertEquals } from "jsr:@std/assert";
import { DenoLsp } from "./mod.ts";

Deno.test({
  name: "DenoLsp — get export types from a file",
  ignore: Deno.env.get("CI") === "true",
  async fn() {
    const lsp = new DenoLsp(Deno.cwd());
    await lsp.initialize();

    try {
      const exports = await lsp.getExportTypes(
        "src/core/business/classify/mod.ts",
      );
      assert(exports.length > 0, "should find exports");
      const names = exports.map((e) => e.name);
      assert(names.includes("classifyFile"), "should find classifyFile export");
    } finally {
      await lsp.shutdown();
    }
  },
});
