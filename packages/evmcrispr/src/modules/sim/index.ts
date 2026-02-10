import { defineModule } from "../../utils/defineModule";

export type SimMode = "anvil" | "hardhat" | "tenderly";

export const commands = [
  "fork",
  "wait",
  "expect",
  "set-balance",
  "set-code",
  "set-storage-at",
] as const;

export const helpers = [] as const;

export class Sim extends defineModule("sim", commands, helpers) {
  #mode: SimMode | null = null;

  get mode(): SimMode | null {
    return this.#mode;
  }

  set mode(value: SimMode | null) {
    this.#mode = value;
  }
}

export { Sim as ModuleConstructor };
