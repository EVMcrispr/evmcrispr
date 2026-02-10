import type { BindingsManager } from "../../BindingsManager";
import type { EVMcrispr } from "../../EVMcrispr";
import type { IPFSResolver } from "../../IPFSResolver";
import type { Module } from "../../Module";
import { defineModule } from "../../utils/defineModule";

export const commands = [
  "batch",
  "exec",
  "halt",
  "load",
  "set",
  "sign",
  "switch",
  "raw",
  "print",
  "for",
] as const;

export const helpers = [
  "abi.encodeCall",
  "date",
  "ens",
  "get",
  "id",
  "namehash",
  "ipfs",
  "me",
  "token",
  "token.balance",
  "token.amount",
] as const;

export class Std extends defineModule("std", commands, helpers) {
  #modules: Module[];

  constructor(
    bindingsManager: BindingsManager,
    nonces: Record<string, number>,
    evmcrispr: EVMcrispr,
    ipfsResolver: IPFSResolver,
    modules: Module[],
  ) {
    super(bindingsManager, nonces, evmcrispr, ipfsResolver);
    this.#modules = modules;
  }

  get modules(): Module[] {
    return this.#modules;
  }
}

export { Std as ModuleConstructor };
