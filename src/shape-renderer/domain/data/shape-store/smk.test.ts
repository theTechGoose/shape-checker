import { assertEquals } from "#std/assert";
import { ShapeStore } from "./mod.ts";

Deno.test("ShapeStore — loads and parses canonical-paths.json", async () => {
  const store = new ShapeStore("assets/canonical-paths.json");
  const data = await store.load();
  assertEquals(typeof data, "object");
  assertEquals(typeof data["src"], "object");
});
