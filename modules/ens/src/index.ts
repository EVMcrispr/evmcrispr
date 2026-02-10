import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";

export default class Ens extends defineModule("ens", commands, helpers) {}
