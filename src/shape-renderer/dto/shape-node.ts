import { z } from "#zod";

export const ShapeNodeSchema: z.ZodType<ShapeNode> = z.lazy(() =>
  z.union([
    z.string(),
    z.array(z.union([z.string(), z.record(z.string(), ShapeNodeSchema)])),
    z.record(z.string(), ShapeNodeSchema),
  ])
);

export type ShapeNode =
  | string
  | (string | { [key: string]: ShapeNode })[]
  | { [key: string]: ShapeNode };

export const CanonicalPathsSchema = z.record(z.string(), ShapeNodeSchema);
export type CanonicalPaths = z.infer<typeof CanonicalPathsSchema>;
