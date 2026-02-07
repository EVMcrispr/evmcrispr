import type { BindingsManager } from "../../BindingsManager";
import type { EVMcrispr } from "../../EVMcrispr";
import type { IPFSResolver } from "../../IPFSResolver";
import { Module } from "../../Module";
import { commands } from "./commands";
import { helpers } from "./helpers";

export class Tenderly extends Module {
  constructor(
    bindingsManager: BindingsManager,
    nonces: Record<string, number>,
    evmcrispr: EVMcrispr,
    ipfsResolver: IPFSResolver,
    alias?: string,
  ) {
    super(
      "tenderly",
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
