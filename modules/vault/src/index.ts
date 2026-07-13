import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";

export default class Vault extends defineModule("vault", commands, helpers) {}
