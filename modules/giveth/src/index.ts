import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";

export default class Giveth extends defineModule("giveth", commands, helpers) {}
