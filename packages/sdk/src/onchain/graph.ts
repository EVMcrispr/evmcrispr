/**
 * Lower unresolved calldata to a lazy, memoized graph of canonical ABI
 * values: the builder behind every `Expressions.evaluate` operand and
 * every collection callback compiled as a graph. Nodes are hash-consed,
 * so a subterm named twice becomes one node evaluated once.
 */
import {
  type AbiFunction,
  type AbiParameter,
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
  parseAbiParameters,
  toFunctionSelector,
} from "viem";
import { COLLECTIONS_ADDRESS } from "./addresses";
import { COLLECTIONS_ABI } from "./collection-abi";
import { CORE_ABI, encodeResolve } from "./core";
import { FETCHER_TYPE, type InputParam, staticCallParam } from "./erc8211";
import {
  abiDescriptor,
  argumentDescriptor,
  EXPRESSION_TYPE,
  EXPRESSIONS_ABI,
  type Expression,
  type ExpressionNode,
  encodeEvaluate,
  expressionsAddress,
} from "./expressions";
import { OPERATIONS_ABI } from "./operators";
import type { CompileCtx } from "./types";

const INPUT_TYPE = (CORE_ABI.find((f) => f.name === "resolve") as AbiFunction)
  .inputs[0];
const BYTES: AbiParameter = { type: "bytes" };
export class GraphBuilder {
  nodes: ExpressionNode[] = [];
  private cache = new Map<string, number>();
  constructor(
    readonly ctx: CompileCtx,
    readonly markers = new Map<string, { index: number; type: AbiParameter }>(),
  ) {}
  node(
    kind: number,
    valueType: string,
    refs: number[] = [],
    data: Hex = "0x",
    selector: Hex = "0x00000000",
    args = "",
  ): number {
    const node = {
      kind,
      valueType,
      refs: refs.map(BigInt),
      data,
      selector,
      arguments: args,
    };
    const key = JSON.stringify(node, (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    const found = this.cache.get(key);
    if (found !== undefined) return found;
    const i = this.nodes.length;
    this.nodes.push(node);
    this.cache.set(key, i);
    return i;
  }
  literal(type: AbiParameter, value: unknown): number {
    return this.node(
      0,
      abiDescriptor(type),
      [],
      encodeAbiParameters([type], [value] as never),
    );
  }
  parameter(type: AbiParameter, index: number): number {
    return this.node(
      1,
      abiDescriptor(type),
      [],
      encodeAbiParameters([{ type: "uint256" }], [BigInt(index)]),
    );
  }
  wrap(ref: number): number {
    return this.node(5, "bytes", [ref]);
  }
  array(type: string, refs: number[]): number {
    return this.node(6, `${type}[]`, refs, "0x", "0x00000000", type);
  }
  tuple(type: AbiParameter, refs: number[]): number {
    return this.node(
      7,
      abiDescriptor(type),
      refs,
      "0x",
      "0x00000000",
      argumentDescriptor(
        (type as { components: readonly AbiParameter[] }).components,
      ),
    );
  }
  call(
    target: number,
    selector: Hex,
    types: readonly AbiParameter[],
    refs: number[],
    output: string,
  ): number {
    return this.node(
      3,
      output,
      [target, ...refs],
      "0x",
      selector,
      argumentDescriptor(types),
    );
  }
  operation(name: string, refs: number[], output?: string): number {
    const fn = OPERATIONS_ABI.find(
      (f) => f.type === "function" && f.name === name,
    ) as AbiFunction;
    return this.call(
      this.literal({ type: "address" }, this.ctx.operators),
      toFunctionSelector(fn),
      fn.inputs,
      refs,
      output ?? abiDescriptor(fn.outputs[0]),
    );
  }
  collection(name: string, refs: number[]): number {
    const fn = COLLECTIONS_ABI.find(
      (f) => f.type === "function" && f.name === name,
    ) as AbiFunction;
    return this.call(
      this.literal(
        { type: "address" },
        this.ctx.collections ?? COLLECTIONS_ADDRESS,
      ),
      toFunctionSelector(fn),
      fn.inputs,
      refs,
      abiDescriptor(fn.outputs[0]),
    );
  }
  rawInput(
    fragment: number,
    constraints: InputParam["constraints"] = [],
  ): number {
    return this.tuple(INPUT_TYPE, [
      this.literal({ type: "uint8" }, 2),
      this.literal({ type: "uint8" }, 0),
      fragment,
      this.literal(
        (INPUT_TYPE as { components: readonly AbiParameter[] }).components[3],
        constraints,
      ),
    ]);
  }
  asType(fragment: number, type: AbiParameter): number {
    const fn = CORE_ABI.find((f) => f.name === "resolve") as AbiFunction;
    return this.call(
      this.literal({ type: "address" }, this.ctx.core),
      toFunctionSelector(fn),
      fn.inputs,
      [this.rawInput(fragment)],
      abiDescriptor(type),
    );
  }
  /** Call with canonical arguments, retaining arbitrary returndata as a bytes value. */
  invoke(
    target: number,
    selector: Hex,
    types: readonly AbiParameter[],
    refs: number[],
  ): number {
    const args = types.length
      ? this.operation("encodeBytes", [
          this.literal({ type: "string" }, argumentDescriptor(types)),
          this.array(
            "bytes",
            refs.map((r) => this.wrap(r)),
          ),
        ])
      : this.literal(BYTES, "0x");
    const data = this.operation("concat", [
      this.array("bytes", [this.literal(BYTES, selector), args]),
      this.literal(BYTES, "0x"),
    ]);
    return this.operation("rawCall", [target, data]);
  }
  private condition(param: InputParam): number {
    const fn = CORE_ABI.find((f) => f.name === "pick") as AbiFunction;
    const word = this.call(
      this.literal({ type: "address" }, this.ctx.core),
      toFunctionSelector(fn),
      fn.inputs,
      [
        this.rawInput(this.fragment(param)),
        this.literal({ type: "int256" }, 0n),
      ],
      "uint256",
    );
    return this.operation(
      "ne",
      [word, this.literal({ type: "uint256" }, 0n)],
      "bool",
    );
  }
  resolve(param: InputParam, type: string): number {
    return this.node(2, type, [], encodeAbiParameters([INPUT_TYPE], [param]));
  }
  /** Identify the final target before calling it, so probes retain its revert bytes. */
  probe(param: InputParam, selector: Hex): number {
    if (param.fetcherType !== FETCHER_TYPE.StaticCall)
      throw new Error("Error expectation requires a static call");
    const [target, data] = decodeAbiParameters(
      [{ type: "address" }, { type: "bytes" }],
      param.paramData,
    );
    let targetRef = this.literal({ type: "address" }, target),
      dataRef = this.calldata(target, data);
    if (target.toLowerCase() === this.ctx.core.toLowerCase()) {
      const decoded = decodeFunctionData({ abi: CORE_ABI, data });
      const args = decoded.args as unknown as unknown[];
      if (decoded.functionName === "read") {
        targetRef = this.asType(this.fragment(args[0] as InputParam), {
          type: "address",
        });
        dataRef = this.operation("concat", [
          this.array("bytes", [
            this.literal(BYTES, args[1]),
            ...(args[2] as InputParam[]).map((p) => this.fragment(p)),
          ]),
          this.literal(BYTES, "0x"),
        ]);
      } else if (decoded.functionName === "chain") {
        const calls = args[1] as Hex[];
        const start =
          calls.length === 1
            ? (args[0] as InputParam)
            : staticCallParam(
                this.ctx.core,
                encodeFunctionData({
                  abi: CORE_ABI,
                  functionName: "chain",
                  args: [args[0] as InputParam, calls.slice(0, -1)],
                }),
              );
        targetRef = this.asType(this.fragment(start), { type: "address" });
        dataRef = this.literal(BYTES, calls[calls.length - 1]);
      }
    }
    return this.node(10, "bytes", [targetRef, dataRef], "0x", selector);
  }
  /** Splice another graph in: its nodes re-interned here, parameter
   *  markers rebound. */
  import(expression: Expression): number {
    const refs: number[] = [];
    for (const n of expression.nodes) {
      if (n.kind === 0 && n.valueType === "bytes") {
        const [payload] = decodeAbiParameters([BYTES], n.data);
        const marker = this.markers.get((payload as Hex).toLowerCase());
        if (marker) {
          refs.push(this.wrap(this.parameter(marker.type, marker.index)));
          continue;
        }
      }
      if (n.kind === 2) {
        const [p] = decodeAbiParameters([INPUT_TYPE], n.data);
        const type = parseAbiParameters(n.valueType)[0];
        refs.push(this.asType(this.fragment(p as InputParam), type));
      } else
        refs.push(
          this.node(
            n.kind,
            n.valueType,
            n.refs.map((r) => refs[Number(r)]),
            n.data,
            n.selector,
            n.arguments,
          ),
        );
    }
    return refs[Number(expression.result)];
  }
  /** Preserve unresolved STATIC_CALL wire for core revert probes. */
  wire(param: InputParam): number {
    if (param.fetcherType === FETCHER_TYPE.RawBytes)
      return this.rawInput(
        this.fragment({ ...param, constraints: [] }),
        param.constraints,
      );
    if (param.fetcherType !== FETCHER_TYPE.StaticCall)
      return this.literal(INPUT_TYPE, param);
    const [target, data] = decodeAbiParameters(
      [{ type: "address" }, { type: "bytes" }],
      param.paramData,
    );
    const encoded = this.calldata(target, data);
    const payload = this.operation("encodeBytes", [
      this.literal({ type: "string" }, "(address,bytes)"),
      this.array("bytes", [
        this.wrap(this.literal({ type: "address" }, target)),
        this.wrap(encoded),
      ]),
    ]);
    return this.tuple(INPUT_TYPE, [
      this.literal({ type: "uint8" }, param.paramType),
      this.literal({ type: "uint8" }, param.fetcherType),
      payload,
      this.literal(
        (INPUT_TYPE as { components: readonly AbiParameter[] }).components[3],
        param.constraints,
      ),
    ]);
  }
  calldata(target: Hex, data: Hex): number {
    if (
      ![...this.markers.keys()].some((m) =>
        data.toLowerCase().includes(m.slice(2)),
      )
    )
      return this.literal(BYTES, data);
    const abi =
      target.toLowerCase() === this.ctx.core.toLowerCase()
        ? CORE_ABI
        : target.toLowerCase() === expressionsAddress(this.ctx).toLowerCase()
          ? EXPRESSIONS_ABI
          : OPERATIONS_ABI;
    const decoded = decodeFunctionData({ abi, data });
    const args = decoded.args as readonly unknown[];
    const fn = abi.find(
      (f) => f.type === "function" && f.name === decoded.functionName,
    ) as AbiFunction;
    const refs = fn.inputs.map((t, i) => {
      if (
        t.type === "tuple" &&
        abiDescriptor(t).startsWith("(uint8,uint8,bytes,(uint8,bytes)[])")
      )
        return this.wire(args[i] as InputParam);
      if (
        t.type === "tuple[]" &&
        abiDescriptor(t).startsWith("(uint8,uint8,bytes,(uint8,bytes)[])")
      )
        return this.array(
          abiDescriptor({ ...t, type: "tuple" } as AbiParameter),
          (args[i] as InputParam[]).map((p) => this.wire(p)),
        );
      if (decoded.functionName === "rawCall" && i === 1)
        return this.calldata(args[0] as Hex, args[1] as Hex);
      return this.literal(t, args[i]);
    });
    const packed = this.operation("encodeBytes", [
      this.literal({ type: "string" }, argumentDescriptor(fn.inputs)),
      this.array(
        "bytes",
        refs.map((r) => this.wrap(r)),
      ),
    ]);
    return this.operation("concat", [
      this.array("bytes", [
        this.literal(BYTES, toFunctionSelector(fn)),
        packed,
      ]),
      this.literal(BYTES, "0x"),
    ]);
  }
  fragment(param: InputParam): number {
    const key = `fragment:${JSON.stringify(param)}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    let result: number;
    if (param.constraints.length) {
      result = this.invoke(
        this.literal({ type: "address" }, this.ctx.core),
        toFunctionSelector(
          CORE_ABI.find((f) => f.name === "resolve") as AbiFunction,
        ),
        [INPUT_TYPE],
        [
          this.rawInput(
            this.fragment({ ...param, constraints: [] }),
            param.constraints,
          ),
        ],
      );
    } else if (param.fetcherType === FETCHER_TYPE.RawBytes) {
      const marker = this.markers.get(param.paramData.toLowerCase());
      result = marker
        ? this.wrap(this.parameter(marker.type, marker.index))
        : this.literal(BYTES, param.paramData);
    } else if (
      ![...this.markers.keys()].some((m) =>
        param.paramData.toLowerCase().includes(m.slice(2)),
      )
    ) {
      // This branch remains inside the graph: unselected branches never resolve captures.
      const wrapped = staticCallParam(
        this.ctx.operators,
        this.rawCallData(this.ctx.core, encodeResolve(param)),
      );
      result = this.node(
        2,
        "bytes",
        [],
        encodeAbiParameters([INPUT_TYPE], [wrapped]),
      );
    } else if (param.fetcherType === FETCHER_TYPE.StaticCall) {
      const [target, data] = decodeAbiParameters(
        [{ type: "address" }, { type: "bytes" }],
        param.paramData,
      );
      const address = target.toLowerCase();
      if (address === this.ctx.core.toLowerCase()) {
        const decoded = decodeFunctionData({ abi: CORE_ABI, data });
        const args = decoded.args as unknown as unknown[];
        if (decoded.functionName === "resolve")
          result = this.fragment(args[0] as InputParam);
        else if (decoded.functionName === "cond")
          result = this.node(4, "bytes", [
            this.condition(args[0] as InputParam),
            this.fragment(args[1] as InputParam),
            this.fragment(args[2] as InputParam),
          ]);
        else if (decoded.functionName === "read") {
          const fragments = (args[2] as InputParam[]).map((p) =>
            this.fragment(p),
          );
          const calldata = this.operation("concat", [
            this.array("bytes", [this.literal(BYTES, args[1]), ...fragments]),
            this.literal(BYTES, "0x"),
          ]);
          result = this.operation("rawCall", [
            this.asType(this.fragment(args[0] as InputParam), {
              type: "address",
            }),
            calldata,
          ]);
        } else if (decoded.functionName === "get") {
          // Whole canonical arguments: each becomes a typed node, the
          // call a Call-shaped invoke retaining raw returndata.
          const descriptor = args[2] as string;
          const types =
            descriptor === "()"
              ? []
              : parseAbiParameters(descriptor.slice(1, -1));
          const refs = (args[3] as InputParam[]).map((p, i) =>
            this.asType(this.fragment(p), types[i]),
          );
          result = this.invoke(
            this.asType(this.fragment(args[0] as InputParam), {
              type: "address",
            }),
            args[1] as Hex,
            types,
            refs,
          );
        } else if (decoded.functionName === "gather") {
          result = this.wrap(
            this.array(
              "bytes",
              (args[0] as InputParam[]).map((p) => this.fragment(p)),
            ),
          );
        } else {
          if (decoded.functionName === "orElse") {
            result = this.node(8, "bytes", [
              this.fragment(args[0] as InputParam),
              this.fragment(args[1] as InputParam),
            ]);
            this.cache.set(key, result);
            return result;
          }
          if (decoded.functionName === "isValid") {
            result = this.wrap(
              this.node(9, "uint256", [this.fragment(args[0] as InputParam)]),
            );
            this.cache.set(key, result);
            return result;
          }
          if (decoded.functionName === "revertData") {
            const fn = CORE_ABI.find(
              (f) => f.name === "revertData",
            ) as AbiFunction;
            result = this.invoke(
              this.literal({ type: "address" }, target),
              toFunctionSelector(fn),
              fn.inputs,
              [
                this.wire(args[0] as InputParam),
                this.literal(fn.inputs[1], args[1]),
              ],
            );
            this.cache.set(key, result);
            return result;
          }
          const fn = CORE_ABI.find(
            (f) => f.name === decoded.functionName,
          ) as AbiFunction;
          result = this.invoke(
            this.literal({ type: "address" }, target),
            toFunctionSelector(fn),
            fn.inputs,
            fn.inputs.map((t, i) =>
              t.type === "tuple"
                ? this.rawInput(this.fragment(args[i] as InputParam))
                : this.literal(t, args[i]),
            ),
          );
        }
      } else if (address === expressionsAddress(this.ctx).toLowerCase()) {
        // A nested graph merges into this one, node for node.
        const decoded = decodeFunctionData({ abi: EXPRESSIONS_ABI, data });
        const args = decoded.args as unknown as unknown[];
        if (
          decoded.functionName === "evaluate" ||
          decoded.functionName === "evaluateEncoded"
        ) {
          const expression =
            decoded.functionName === "evaluate"
              ? (args[0] as Expression)
              : (decodeAbiParameters(
                  [EXPRESSION_TYPE],
                  args[0] as Hex,
                )[0] as Expression);
          result = this.wrap(this.import(expression));
        } else throw new Error("Unsupported nested Expressions call");
      } else if (address === this.ctx.operators.toLowerCase()) {
        const decoded = decodeFunctionData({ abi: OPERATIONS_ABI, data });
        if (decoded.functionName !== "rawCall")
          throw new Error(
            `Unsupported embedded parameter in ${decoded.functionName}`,
          );
        const [innerTarget, innerData] = decoded.args as readonly [Hex, Hex];
        if (innerTarget.toLowerCase() !== this.ctx.core.toLowerCase())
          throw new Error("Unsupported embedded dynamic raw call target");
        const inner = decodeFunctionData({ abi: CORE_ABI, data: innerData });
        if (inner.functionName !== "resolve")
          throw new Error("Unsupported embedded dynamic raw call");
        result = this.wrap(this.fragment(inner.args[0] as InputParam));
      } else
        throw new Error("Unsupported embedded parameter in opaque calldata");
    } else throw new Error("Unsupported embedded collection callback fetcher");
    this.cache.set(key, result);
    return result;
  }
  private rawCallData(target: Hex, data: Hex): Hex {
    const fn = OPERATIONS_ABI.find(
      (f) => f.type === "function" && f.name === "rawCall",
    ) as AbiFunction;
    return `${toFunctionSelector(fn)}${encodeAbiParameters(fn.inputs, [target, data]).slice(2)}` as Hex;
  }
  /** The graph as an `Expression` whose result is `result`. */
  build(result: number): Expression {
    return { core: this.ctx.core, nodes: this.nodes, result: BigInt(result) };
  }
}

/** A graph as an operand: `Expressions.evaluate(expression, [])` at the
 *  Expressions address, raw-returning the result node's value. */
export function graphParam(
  ctx: CompileCtx,
  graph: GraphBuilder,
  result: number,
): InputParam {
  return staticCallParam(
    expressionsAddress(ctx),
    encodeEvaluate(graph.build(result)),
  );
}

/** A revert probe as a one-node graph: `ProbeCall` keeps the final
 *  target's own revert bytes where the core's `revertData` over a
 *  composed chain would see the core's wrapping error instead. */
export function probeCallParam(
  ctx: CompileCtx,
  param: InputParam,
  selector: Hex,
): InputParam {
  const graph = new GraphBuilder(ctx);
  return graphParam(ctx, graph, graph.probe(param, selector));
}
