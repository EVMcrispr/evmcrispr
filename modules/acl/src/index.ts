import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";

export default class Acl extends defineModule("acl", commands, helpers) {}
