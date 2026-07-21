---
title: MCP Server
---

EVMcrispr ships a hosted [Model Context Protocol](https://modelcontextprotocol.io)
server so AI assistants can write, validate, and simulate EVML scripts for you.
It speaks streamable HTTP, requires no authentication, and is available at:

```
https://mcp.evmcrispr.com/mcp
```

The server exposes seven tools:

- `list-modules` — list all available EVMcrispr modules
- `describe-module` — commands and helpers of a specific module
- `get-docs` — fetch guide and reference documentation
- `validate-evml` — parse and statically check a script
- `simulate-evml` — simulate a script on a forked chain
- `create-link` — generate a link that opens a script in the terminal
- `publish-module` — publish a reusable EVML module

The server never touches your funds: it only validates, simulates, and
generates links. Execution always happens in the
[EVMcrispr terminal](https://next.evmcrispr.com) with your own wallet, where
you review and sign every transaction yourself.

## ChatGPT

Custom MCP connectors require a paid plan (Plus, Pro, Business, Enterprise, or
Edu) and developer mode:

1. Open **Settings → Apps & Connectors → Advanced settings** and enable
   **Developer mode**.
2. Back in **Apps & Connectors**, click **Create** to add a custom connector.
3. Name it `EVMcrispr`, set the MCP server URL to
   `https://mcp.evmcrispr.com/mcp`, and choose **No authentication**.
4. In a chat, open the **+** menu → **Developer mode** and enable the
   EVMcrispr connector for that conversation.

## Claude

On [claude.ai](https://claude.ai) or the Claude desktop app (paid plans):

1. Go to **Settings → Connectors**.
2. Click **Add custom connector**.
3. Name it `EVMcrispr` and paste `https://mcp.evmcrispr.com/mcp` as the URL.
4. Enable it from the tools menu in any chat.

## Claude Code

Add the server from your terminal:

```bash
claude mcp add --transport http evmcrispr https://mcp.evmcrispr.com/mcp
```

Or, to share it with everyone working on a repository, commit a `.mcp.json`
file at the project root:

```json
{
  "mcpServers": {
    "evmcrispr": {
      "type": "http",
      "url": "https://mcp.evmcrispr.com/mcp"
    }
  }
}
```

Run `/mcp` inside Claude Code to check the connection status.

## Cursor

[Add to Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=evmcrispr&config=eyJ1cmwiOiJodHRwczovL21jcC5ldm1jcmlzcHIuY29tL21jcCJ9)
(one-click install), or create the config by hand in `.cursor/mcp.json` in
your project — or `~/.cursor/mcp.json` to enable it everywhere:

```json
{
  "mcpServers": {
    "evmcrispr": {
      "url": "https://mcp.evmcrispr.com/mcp"
    }
  }
}
```

Then check **Settings → MCP** to verify the server shows its tools.

## Try It

Once connected, ask your assistant things like:

- "What EVMcrispr modules are available?"
- "Write an EVML script that transfers 100 DAI on Gnosis Chain, simulate it,
  and give me a link to run it."
- "Validate this EVML script and explain any errors."

## Next Steps

- [Getting Started](getting-started.md) — the terminal and your first script
- [Language Basics](language-basics.md) — full syntax reference
- [Simulation](simulation.md) — how forked-chain simulation works
