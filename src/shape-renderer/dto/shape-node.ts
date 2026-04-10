import { z } from "#zod";

const FileSpecSchema = z.object({
  ext: z.array(z.string()).optional(),
  desc: z.string().optional(),
  optional: z.boolean().optional(),
});

export const ShapeNodeSchema: z.ZodType<ShapeNode> = z.lazy(() =>
  z.union([
    z.string(),
    FileSpecSchema,
    z.array(z.union([z.string(), z.record(z.string(), ShapeNodeSchema)])),
    z.record(z.string(), ShapeNodeSchema),
  ])
);

export type FileSpec = z.infer<typeof FileSpecSchema>;

export type ShapeNode =
  | string
  | FileSpec
  | (string | { [key: string]: ShapeNode })[]
  | { [key: string]: ShapeNode };

export const CanonicalPathsSchema = z.record(z.string(), ShapeNodeSchema);
export type CanonicalPaths = z.infer<typeof CanonicalPathsSchema>;
