import { registerAllModules } from "evmcrispr/lib/modules";
import { engines } from "../../../package.json";

if (!Bun.semver.satisfies(Bun.version, engines.bun)) {
  throw new Error(
    `EVMcrispr requires Bun ${engines.bun}; running ${Bun.version}`,
  );
}

// The CLI-backed MCP tools still use the historical names. Both interfaces
// share the server's credentials; these values never enter a browser build.
for (const name of ["ETHERSCAN_API_KEY", "PINATA_JWT"] as const) {
  const value = process.env[name];
  if (value !== undefined) process.env[`VITE_${name}`] ??= value;
}

registerAllModules();

const transport = process.env.TRANSPORT ?? "http";

switch (transport) {
  case "stdio": {
    const { startStdio } = await import("./mcp/stdio.js");
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
