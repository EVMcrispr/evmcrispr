/**
 * The Web3 Function side of Gelato's sandbox protocol, as
 * @gelatonetwork/web3-functions-sdk 2.4.4 implements it (Web3Function.ts +
 * net/Web3FunctionHttpServer.ts), without the SDK: it drags ethers v5 into
 * the bundle for a provider the runner bypasses.
 *
 * The sandbox starts the bundle under Deno and connects to an HTTP server
 * it expects on WEB3_FUNCTION_SERVER_PORT at /WEB3_FUNCTION_MOUNT_PATH:
 * `GET` answers "ok" (the readiness probe), `POST` carries one event,
 * `{ action: "start", data: { operation, context } }`, answered with a
 * result (or error) event; the process exits once that is delivered.
 * Chain reads go through the RPC proxy the context names, per chain at
 * `${rpcProviderUrl}/${chainId}`; the proxy answering "Request limit
 * exceeded" means the run is over (exit code 250, as the SDK does).
 */

declare const Deno: {
  env: { get(key: string): string | undefined };
  exit(code?: number): never;
  serve(
    options: {
      port: number;
      hostname: string;
      onListen?: () => void;
    },
    handler: (request: Request) => Response | Promise<Response>,
  ): { shutdown(): Promise<void> };
};

export type UserArgValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | boolean[];

/** What the sandbox sends with a `start` event (Web3FunctionContextData). */
export interface StartContext {
  gelatoArgs: { chainId: number; gasPrice: string; taskId?: string };
  rpcProviderUrl?: string;
  userArgs: Record<string, UserArgValue>;
  secrets: Record<string, string | undefined>;
  storage: Record<string, string | undefined>;
}

export interface StartEvent {
  action: "start";
  data: { operation: "onRun" | "onSuccess" | "onFail"; context: StartContext };
}

export type CallData = { to: string; data: string; value?: string };

/** What onRun returns (Web3FunctionResultV2). */
export type RunResult =
  | { canExec: true; callData: CallData[] }
  | { canExec: false; message: string };

export type Send = (method: string, params: unknown[]) => Promise<unknown>;

/** One JSON-RPC call through the sandbox's RPC proxy. */
export function proxyRpc(base: string, chainId: number): Send {
  let id = 0;
  return async (method, params) => {
    const res = await fetch(`${base}/${chainId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    const body = (await res.json()) as {
      result?: unknown;
      error?: { code?: number; message: string; data?: unknown };
    };
    if (body.error) {
      if (/Request limit exceeded/.test(body.error.message)) {
        console.error("Web3FunctionError: RPC requests limit exceeded");
        Deno.exit(250);
      }
      throw Object.assign(new Error(body.error.message), {
        code: body.error.code,
        data: body.error.data,
      });
    }
    return body.result;
  };
}

/** The context handed to onRun, built from a start event. */
export interface RunContext {
  gelatoArgs: StartContext["gelatoArgs"];
  userArgs: StartContext["userArgs"];
  multiChainProvider: { chainId(id: number): { send: Send } };
}

const callbacks = { onFail: false, onSuccess: false };

export async function handleEvent(
  event: StartEvent,
  onRun: (ctx: RunContext) => Promise<RunResult>,
): Promise<unknown> {
  if (event?.action !== "start") {
    throw new Error(`Unrecognized parent process event: ${event?.action}`);
  }
  const { operation, context } = event.data;
  const storage = { state: "last", storage: context.storage, diff: {} };
  try {
    if (operation !== "onRun") {
      throw new Error(`Web3Function.${operation} function is not registered`);
    }
    const base = context.rpcProviderUrl ?? "";
    const result = await onRun({
      gelatoArgs: context.gelatoArgs,
      userArgs: context.userArgs,
      multiChainProvider: {
        chainId: (id) => ({ send: proxyRpc(base, id) }),
      },
    });
    return { action: "result", data: { result, storage, callbacks } };
  } catch (err) {
    const error = err as Error;
    return {
      action: "error",
      data: {
        error: { name: error.name, message: `${error.name}: ${error.message}` },
        storage,
        callbacks,
      },
    };
  }
}

/** Serve the function to the sandbox; returns once the process exits. */
export function serveWeb3Function(
  onRun: (ctx: RunContext) => Promise<RunResult>,
): void {
  globalThis.addEventListener("unhandledrejection", (e) => {
    console.log(
      "Unhandled promise rejection at:",
      (e as PromiseRejectionEvent).promise,
    );
    Deno.exit(251);
  });
  const port = Number(Deno.env.get("WEB3_FUNCTION_SERVER_PORT") ?? 80);
  const mountPath = Deno.env.get("WEB3_FUNCTION_MOUNT_PATH") ?? "";
  const server = Deno.serve(
    { port, hostname: "0.0.0.0", onListen: () => {} },
    async (request) => {
      if (new URL(request.url).pathname !== `/${mountPath}`) {
        return new Response("invalid path", { status: 400 });
      }
      if (request.method === "GET") return new Response("ok");
      if (request.method !== "POST") {
        return new Response(`unsupported method: ${request.method}`, {
          status: 500,
        });
      }
      let reply: unknown;
      try {
        reply = await handleEvent((await request.json()) as StartEvent, onRun);
      } catch (err) {
        return new Response(`Internal error: ${(err as Error).message}`, {
          status: 500,
        });
      }
      // One event per run: leave once the reply has been delivered.
      setTimeout(async () => {
        await server.shutdown();
        Deno.exit(0);
      });
      return new Response(JSON.stringify(reply));
    },
  );
}
