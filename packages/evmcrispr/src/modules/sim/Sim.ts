import type { BindingsManager } from "../../BindingsManager";
import type { EVMcrispr } from "../../EVMcrispr";
import type { IPFSResolver } from "../../IPFSResolver";
import { Module } from "../../Module";
import { commands } from "./commands";
import { helpers } from "./helpers";

export type SimMode = "anvil" | "hardhat" | "tenderly";

export class Sim extends Module {
  #mode: SimMode | null = null;

  get mode(): SimMode | null {
    return this.#mode;
  }

  set mode(value: SimMode | null) {
    this.#mode = value;
  }

  constructor(
    bindingsManager: BindingsManager,
    nonces: Record<string, number>,
    evmcrispr: EVMcrispr,
    ipfsResolver: IPFSResolver,
    alias?: string,
  ) {
    super(
      "sim",
      bindingsManager,
      nonces,
      commands,
      helpers,
      evmcrispr,
      ipfsResolver,
      alias,
    );
  }
}
