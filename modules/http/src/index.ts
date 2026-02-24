import { defineModule } from "@evmcrispr/sdk";
import { commands, helpers } from "./_generated";
import { types } from "./argTypes";

export default class Http extends defineModule("http", commands, helpers, types) {}
