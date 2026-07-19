import { evml, NodeType, parseScript } from "@evmcrispr/core";

const PINATA_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";

/**
 * Validate and pin a plain (unencrypted) EVML module file to IPFS byte-exact,
 * so it can be loaded with `load <alias> --from ipfs://<cid>`. Encrypted
 * share links (create-link) require their key: `--from "ipfs://<cid>#<key>"`.
 */
export async function publishModule(args: { source: string }): Promise<{
  success: boolean;
  cid?: string;
  uri?: string;
  moduleName?: string;
  loadLine?: string;
  error?: string;
  diagnostics?: unknown[];
}> {
  const jwt = process.env.VITE_PINATA_JWT;
  if (!jwt) {
    return {
      success: false,
      error:
        "VITE_PINATA_JWT environment variable is not set. Get an API key from pinata.cloud.",
    };
  }

  // Structural validation: exactly one `module <name> ( ...defs )` command.
  let moduleName: string | undefined;
  try {
    const { ast, errors } = parseScript(args.source);
    if (errors.length) {
      return { success: false, error: `parse errors:\n${errors.join("\n")}` };
    }
    const commands = ast.body.filter(
      (n) => n?.type === NodeType.CommandExpression,
    );
    const isModuleDef =
      commands.length === 1 &&
      commands[0].name === "def" &&
      (!commands[0].module || commands[0].module === "std") &&
      commands[0].args[0]?.type === NodeType.Bareword &&
      commands[0].args[0].value === "module";
    if (!isModuleDef) {
      return {
        success: false,
        error: "a module file must contain exactly one def module command",
      };
    }
    const nameArg = commands[0].args[1];
    if (nameArg?.type !== NodeType.Bareword) {
      return { success: false, error: "the def module command needs a name" };
    }
    moduleName = String(nameArg.value);
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  // Semantic validation (offline): def-only block, signatures, name rules.
  const { diagnostics, valid } = await evml.script(args.source).validate();
  if (!valid) {
    return {
      success: false,
      error: "the module file has validation errors",
      diagnostics,
    };
  }

  try {
    const body = new FormData();
    body.append(
      "file",
      new Blob([args.source], { type: "text/plain" }),
      `${moduleName}.evml`,
    );
    body.append("pinataOptions", JSON.stringify({ cidVersion: 0 }));
    body.append(
      "pinataMetadata",
      JSON.stringify({
        name: `EVMcrispr module - ${moduleName}`,
        keyvalues: { type: "evmcrispr/module", version: "2" },
      }),
    );

    const res = await fetch(PINATA_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      body,
    });

    if (!res.ok) {
      return {
        success: false,
        error: `Pinata error ${res.status}: ${await res.text()}`,
      };
    }
    const { IpfsHash } = (await res.json()) as { IpfsHash: string };
    if (!IpfsHash) {
      return { success: false, error: "Pinata returned no CID" };
    }
    return {
      success: true,
      cid: IpfsHash,
      uri: `ipfs://${IpfsHash}`,
      moduleName,
      loadLine: `load ${moduleName} --from ipfs://${IpfsHash}`,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
