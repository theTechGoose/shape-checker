import { assertEquals } from "#std/assert";
import TreeNode from "./mod.ts";

Deno.test("TreeNode — toggle flips expanded state", () => {
  const node = new TreeNode();
  assertEquals(node.expanded, true);
  node.toggle();
  assertEquals(node.expanded, false);
  node.toggle();
  assertEquals(node.expanded, true);
});
