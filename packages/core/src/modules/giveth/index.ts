import { defineModule } from "../../utils/defineModule";

export const commands = [
  "donate",
  "finalize-givbacks",
  "initiate-givbacks",
  "verify-givbacks",
] as const;

export const helpers = ["projectAddr"] as const;

export class Giveth extends defineModule("giveth", commands, helpers) {}

export { Giveth as ModuleConstructor };
