import type { Rule } from "../types.ts";

import { check as structureCheck } from "./structure/mod.ts";
import { generateSuggestion as structureSuggest } from "./structure/llm.ts";

import { check as layerCheck } from "./layer-restrictions/mod.ts";
import { generateSuggestion as layerSuggest } from "./layer-restrictions/llm.ts";

import { check as moduleCheck } from "./module-isolation/mod.ts";
import { generateSuggestion as moduleSuggest } from "./module-isolation/llm.ts";

import { check as polyCheck } from "./poly-isolation/mod.ts";
import { generateSuggestion as polySuggest } from "./poly-isolation/llm.ts";

import { check as dtoCheck } from "./dto-validation/mod.ts";
import { generateSuggestion as dtoSuggest } from "./dto-validation/llm.ts";

import { check as barrelCheck } from "./barrel-discipline/mod.ts";
import { generateSuggestion as barrelSuggest } from "./barrel-discipline/llm.ts";

export const rules: Rule[] = [
  {
    name: "structure",
    description: "Validates file/folder placement against canonical-paths.json",
    check: structureCheck,
    generateSuggestion: structureSuggest,
  },
  {
    name: "layer-restrictions",
    description: "Enforces allowed layer-to-layer import directions",
    check: layerCheck,
    generateSuggestion: layerSuggest,
  },
  {
    name: "module-isolation",
    description: "Prevents cross-module imports outside core and mod-root",
    check: moduleCheck,
    generateSuggestion: moduleSuggest,
  },
  {
    name: "poly-isolation",
    description: "Ensures poly-mod is the only public surface for polymorphic features",
    check: polyCheck,
    generateSuggestion: polySuggest,
  },
  {
    name: "dto-validation",
    description: "Requires runtime validation in DTO files",
    check: dtoCheck,
    generateSuggestion: dtoSuggest,
  },
  {
    name: "barrel-discipline",
    description: "Restricts re-exports to mod-root, poly-mod, and bootstrap only",
    check: barrelCheck,
    generateSuggestion: barrelSuggest,
  },
];
