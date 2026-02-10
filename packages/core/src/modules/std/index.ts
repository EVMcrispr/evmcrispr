import type { Module } from "../../Module";
import type { ModuleContext } from "../../types";
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

  constructor(context: ModuleContext, modules: Module[]) {
    super(context);
    this.#modules = modules;
  }

  get modules(): Module[] {
    return this.#modules;
  }
}

export { Std as ModuleConstructor };
