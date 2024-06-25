import type { BindingsManager } from "../../BindingsManager";

import { Module } from "../../Module";
import type { IPFSResolver } from "../../IPFSResolver";
import { commands } from "./commands";
import { helpers } from "./helpers";
import type { EVMcrispr } from "../../EVMcrispr";

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
