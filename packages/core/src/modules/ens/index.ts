import { defineModule } from "../../utils/defineModule";

export const commands = ["renew"] as const;

export const helpers = ["contenthash"] as const;

export class Ens extends defineModule("ens", commands, helpers) {}

export { Ens as ModuleConstructor };
