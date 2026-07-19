import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";

export default class Crypto extends defineModule("crypto", commands, helpers) {}
