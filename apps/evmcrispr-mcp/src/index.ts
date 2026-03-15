import { registerAllModules } from "evmcrispr/lib/modules";

registerAllModules();

const transport = process.env.TRANSPORT ?? "http";

switch (transport) {
  case "stdio": {
    const { startStdio } = await import("./stdio.js");
    await startStdio();
    break;
  }
  case "http": {
    const { startHttp } = await import("./http.js");
    await startHttp();
    break;
  }
  default:
    console.error(`Unknown transport: ${transport}. Use "stdio" or "http".`);
    process.exit(1);
}
