import { defineModule } from "@evmcrispr/sdk";
import { commands } from "./_generated";

export type SimMode = "anvil" | "hardhat" | "tenderly";

export default class Sim extends defineModule("sim", commands) {
  #mode: SimMode | null = null;

  get mode(): SimMode | null {
    return this.#mode;
  }

  set mode(value: SimMode | null) {
    this.#mode = value;
  }
}
