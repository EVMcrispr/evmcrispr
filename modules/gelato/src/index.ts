import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";

export default class Gelato extends defineModule("gelato", commands, helpers) {}
