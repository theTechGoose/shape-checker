export { runPipeline } from "./domain/coordinators/pipeline/mod.ts";
export { parseArgs, printUsage, printHeader, printResults } from "./entrypoints/cli.ts";
export type { RuleDefinition } from "@core/dto/types.ts";

import type { RuleDefinition } from "@core/dto/types.ts";

import {
  barrelDiscipline,
  dtoValidation,
  layerRestrictions,
  moduleIsolation,
  polyDetection,
  polyIsolation,
  polyStray,
  structure,
  importAliases,
  externalImports,
} from "./domain/business/rules/poly-mod.ts";

export const rules: RuleDefinition[] = [
  { name: "structure", description: "Validates file/folder placement against canonical-paths.json", check: structure.check, systemPrompt: structure.SYSTEM_PROMPT, buildPrompt: structure.buildPrompt },
  { name: "layer-restrictions", description: "Enforces allowed layer-to-layer import directions", check: layerRestrictions.check, systemPrompt: layerRestrictions.SYSTEM_PROMPT, buildPrompt: layerRestrictions.buildPrompt },
  { name: "module-isolation", description: "Prevents cross-module imports outside core and mod-root", check: moduleIsolation.check, systemPrompt: moduleIsolation.SYSTEM_PROMPT, buildPrompt: moduleIsolation.buildPrompt },
  { name: "poly-isolation", description: "Ensures poly-mod is the only public surface for polymorphic features", check: polyIsolation.check, systemPrompt: polyIsolation.SYSTEM_PROMPT, buildPrompt: polyIsolation.buildPrompt },
  { name: "dto-validation", description: "Requires runtime validation in DTO files", check: dtoValidation.check, systemPrompt: dtoValidation.SYSTEM_PROMPT, buildPrompt: dtoValidation.buildPrompt },
  { name: "barrel-discipline", description: "Restricts re-exports to mod-root, poly-mod, and bootstrap only", check: barrelDiscipline.check, systemPrompt: barrelDiscipline.SYSTEM_PROMPT, buildPrompt: barrelDiscipline.buildPrompt },
  { name: "poly-detection", description: "Detects sibling features that should be behind a poly-mod", check: polyDetection.check, systemPrompt: polyDetection.SYSTEM_PROMPT, buildPrompt: polyDetection.buildPrompt },
  { name: "poly-stray", description: "Detects standalone features that belong inside an existing poly structure", check: polyStray.check, systemPrompt: polyStray.SYSTEM_PROMPT, buildPrompt: polyStray.buildPrompt },
  { name: "import-aliases", description: "Bans ../ imports — requires @ aliases instead", check: importAliases.check, systemPrompt: importAliases.SYSTEM_PROMPT, buildPrompt: importAliases.buildPrompt },
  { name: "external-imports", description: "Bans bare npm:/jsr: — requires # aliases from import map", check: externalImports.check, systemPrompt: externalImports.SYSTEM_PROMPT, buildPrompt: externalImports.buildPrompt },
];
