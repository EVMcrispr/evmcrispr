import type { BindingsManager } from "../../BindingsManager";
import type { EVMcrispr } from "../../EVMcrispr";
import type { IPFSResolver } from "../../IPFSResolver";
import { Module } from "../../Module";
import { commands } from "./commands";
import { helpers } from "./helpers";

export class Giveth extends Module {
  constructor(
    bindingsManager: BindingsManager,
    nonces: Record<string, number>,
    evmcrispr: EVMcrispr,
    ipfsResolver: IPFSResolver,
    alias?: string,
  ) {
    super(
      "giveth",
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
