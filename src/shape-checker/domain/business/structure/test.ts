import { assertEquals } from "jsr:@std/assert";
import { resolveNode, getRequiredFiles, getExpectedAt } from "./mod.ts";

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
