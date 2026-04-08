import { CanonicalPathsSchema } from "@shape-renderer/dto/shape-node.ts";
import type { CanonicalPaths } from "@shape-renderer/dto/shape-node.ts";

export class ShapeStore {
  constructor(private path: string) {}

  async load(): Promise<CanonicalPaths> {
    const text = await Deno.readTextFile(this.path);
    return CanonicalPathsSchema.parse(JSON.parse(text));
  }

  async save(data: CanonicalPaths): Promise<void> {
    const json = JSON.stringify(data, null, 2) + "\n";
    await Deno.writeTextFile(this.path, json);
  }
}
