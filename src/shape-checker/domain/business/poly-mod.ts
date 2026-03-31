import type { EntryTarget, PipelineContext } from "../../../core/dto/types.ts";

export interface RuleDefinition {
  name: string;
  description: string;
  check(path: string, target: EntryTarget, ctx: PipelineContext): Promise<string[] | null>;
  systemPrompt: string;
  buildPrompt(violations: string[], path: string, target: EntryTarget): string;
}

import { check as structureCheck, SYSTEM_PROMPT as structureSystem, buildPrompt as structureBuild } from "./structure/mod.ts";
import { check as layerCheck, SYSTEM_PROMPT as layerSystem, buildPrompt as layerBuild } from "./layer-restrictions/mod.ts";
import { check as moduleCheck, SYSTEM_PROMPT as moduleSystem, buildPrompt as moduleBuild } from "./module-isolation/mod.ts";
import { check as polyCheck, SYSTEM_PROMPT as polySystem, buildPrompt as polyBuild } from "./poly-isolation/mod.ts";
import { check as dtoCheck, SYSTEM_PROMPT as dtoSystem, buildPrompt as dtoBuild } from "./dto-validation/mod.ts";
import { check as barrelCheck, SYSTEM_PROMPT as barrelSystem, buildPrompt as barrelBuild } from "./barrel-discipline/mod.ts";

export const rules: RuleDefinition[] = [
  { name: "structure", description: "Validates file/folder placement against canonical-paths.json", check: structureCheck, systemPrompt: structureSystem, buildPrompt: structureBuild },
  { name: "layer-restrictions", description: "Enforces allowed layer-to-layer import directions", check: layerCheck, systemPrompt: layerSystem, buildPrompt: layerBuild },
  { name: "module-isolation", description: "Prevents cross-module imports outside core and mod-root", check: moduleCheck, systemPrompt: moduleSystem, buildPrompt: moduleBuild },
  { name: "poly-isolation", description: "Ensures poly-mod is the only public surface for polymorphic features", check: polyCheck, systemPrompt: polySystem, buildPrompt: polyBuild },
  { name: "dto-validation", description: "Requires runtime validation in DTO files", check: dtoCheck, systemPrompt: dtoSystem, buildPrompt: dtoBuild },
  { name: "barrel-discipline", description: "Restricts re-exports to mod-root, poly-mod, and bootstrap only", check: barrelCheck, systemPrompt: barrelSystem, buildPrompt: barrelBuild },
];
