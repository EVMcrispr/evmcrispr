import { serveWeb3Function } from "./protocol";
import { type RunnerContext, run } from "./run";

// The Web3 Function entry: Gelato's sandbox loads this bundle and sends
// one `start` event per trigger, its user args already validated against
// the published schema. `run` is the testable part.
serveWeb3Function((ctx) => run(ctx as RunnerContext));
