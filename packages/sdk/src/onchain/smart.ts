import type { AbiParameter, Address, Hex } from "viem";
import {
  bytesToHex,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  isAddressEqual,
  keccak256,
  parseAbi,
  toFunctionSelector,
} from "viem";
import { ErrorException } from "../errors";
import type { Module } from "../Module";
import type {
  BlockExpressionNode,
  DestructureSlot,
  Node,
  NodesInterpreters,
  TransactionAction,
} from "../types";
import { BindingsSpace, isTransactionAction, NodeType } from "../types";
import { coerceAbiValue, getEncodedCall } from "../utils/encoders";
import { Num } from "../utils/Num";
import { withSender } from "../utils/sender";
import { guardAbiInteger } from "./abi-guards";
import {
  COLLECTIONS_ADDRESS,
  CORE_ADDRESS,
  EXPRESSIONS_ADDRESS,
  OPERATIONS_ADDRESS,
} from "./addresses";
import { typedArrayArg } from "./arrays";
import { defaultCompileCtx } from "./assertion";
import { concatenateResolved, encodeArgumentsParam } from "./collections";
import {
  categoryFromAbiType,
  compileCallValue,
  compileOperand,
  formatParamType,
} from "./compile";
import { headWords, isDynamicParam } from "./construct";
import { encodeCond, encodeResolve } from "./core";
import { isBangHelperNode } from "./dispatch";
import {
  type ComposableExecution,
  constraint,
  encodeComposable,
  type InputParam,
  PARAM_TYPE,
  rawParam,
  staticCallParam,
  targetParam,
  toWord,
} from "./erc8211";
import {
  hasRuntimeValue,
  isRuntimeValue,
  type RuntimeValue,
  type SmartBatchPlan,
  type SmartBatchState,
  type SmartBatchValue,
} from "./smart-types";
import type { CompileCtx, Operand } from "./types";
import { constrainWord } from "./word-constraints";

/** Biconomy ERC-8211 executor, revision 6233263800be445c99269f014a54cf99690ec333. */
export const COMPOSABLE_EXECUTOR_ADDRESS: Address =
  "0x0000821108B5C9F3fe17E40811bE5b66DaF8f0e7";
export const COMPOSABLE_STORAGE_ADDRESS: Address =
  "0x00008211dea1Aca67ac55fc44AE3bF88CF41281d";
export const COMPOSABLE_STORAGE_ABI = parseAbi([
  "function readStorage(bytes32 namespace, bytes32 slot) view returns (bytes32)",
]);

function category(type: AbiParameter): Operand["cat"] {
  if (/^bytes\d+$/.test(type.type)) return "Bytes32";
  if (type.type.includes("[") || type.type.startsWith("tuple")) return "Bytes";
  return categoryFromAbiType(type.type);
}

export function runtimeValue(
  param: InputParam,
  abiType: AbiParameter,
  batchId: Hex,
  operand?: Operand & { kind: "call" },
): RuntimeValue {
  return Object.defineProperty(
    {
      kind: "runtime-value",
      operand: operand ?? {
        kind: "call",
        param,
        cat: category(abiType),
        abiType,
      },
      abiType,
      batchId,
    } as RuntimeValue,
    Symbol.toPrimitive,
    {
      value() {
        throw new ErrorException(
          "runtime values cannot be coerced at build time; use an on-chain helper (!) in a runtime-capable field",
        );
      },
    },
  );
}

export function runtimeBinding(
  ctx: CompileCtx,
  node: Node,
): RuntimeValue | undefined {
  if (node.type !== NodeType.VariableIdentifier) return;
  const value = ctx.module.bindingsManager.getBindingValue(
    String(node.value),
    BindingsSpace.USER,
  );
  if (!isRuntimeValue(value)) return;
  if (value.batchId !== ctx.interpreters.batchContext?.smartState?.plan.salt)
    throw new ErrorException(
      "runtime return values are only available inside their smart batch",
    );
  return value;
}

/** Recognize only explicit on-chain syntax and previously captured outputs. */
export async function interpretSmartValue(
  ctx: CompileCtx,
  node: Node,
): Promise<any> {
  if (node.type === NodeType.DestructurePattern) {
    const resolve = async (slot: DestructureSlot): Promise<any> =>
      Array.isArray(slot)
        ? Promise.all(slot.map(resolve))
        : slot === null
          ? undefined
          : interpretSmartValue(ctx, {
              type: NodeType.VariableIdentifier,
              value: slot,
            });
    return Promise.all(
      (node as import("../types").DestructurePatternNode).slots.map(resolve),
    );
  }
  const binding = runtimeBinding(ctx, node);
  if (binding) return binding;
  if (node.type === NodeType.VariableIdentifier) {
    const composite = ctx.module.bindingsManager.getBindingValue(
      String(node.value),
      BindingsSpace.USER,
    );
    if (hasRuntimeValue(composite)) {
      const validate = (value: any): void => {
        if (isRuntimeValue(value)) {
          if (
            value.batchId !==
            ctx.interpreters.batchContext?.smartState?.plan.salt
          )
            throw new ErrorException(
              "runtime value belongs to a different smart batch",
            );
        } else if (value && typeof value === "object")
          Object.values(value).forEach(validate);
      };
      validate(composite);
      return composite;
    }
  }
  if (node.type === NodeType.ArrayExpression) {
    const elements = (node as any).elements as Node[];
    if (elements?.every((n) => n.type === NodeType.NamedArg)) {
      return Object.fromEntries(
        await Promise.all(
          elements.map(async (n: any) => [
            n.name,
            await interpretSmartValue(ctx, n.value),
          ]),
        ),
      );
    }
    return Promise.all(
      (elements ?? node.value ?? []).map((n: Node) =>
        interpretSmartValue(ctx, n),
      ),
    );
  }
  if (isBangHelperNode(node)) {
    const operand = await compileOperand(ctx, node);
    if (operand.kind === "const") return operand.value;
    const salt = ctx.interpreters.batchContext?.smartState?.plan.salt;
    if (!salt) throw new ErrorException("runtime values require a smart batch");
    if (operand.collection) {
      const array = await typedArrayArg(ctx, node, node.name);
      return runtimeValue(
        array.param,
        { ...array.element, type: `${array.element.type}[]` } as AbiParameter,
        salt,
      );
    }
    const abiType = operand.abiType ?? {
      type: (
        {
          Uint: "uint256",
          Int: "int256",
          Address: "address",
          Bool: "bool",
          Bytes32: "bytes32",
          String: "string",
          Bytes: "bytes",
        } as const
      )[operand.cat],
    };
    return runtimeValue(operand.param, abiType, salt, operand);
  }
  // ::! is explicit. Plain :: retains its normal build-time read gate.
  if (node.type === NodeType.CallExpression && (node as any).bang) {
    const { param, terminal } = await compileCallValue(ctx, node as any);
    return runtimeValue(
      param,
      terminal,
      ctx.interpreters.batchContext!.smartState!.plan.salt,
    );
  }
  const value = await ctx.interpreters.interpretNode(node);
  if (hasRuntimeValue(value))
    throw new ErrorException(
      "use an on-chain helper (!) to consume a runtime return value",
    );
  return value;
}

/** Canonical ABI encoding for constants, runtime values and composite literals. */
export function smartValueParam(
  ctx: CompileCtx,
  type: AbiParameter,
  value: any,
): InputParam {
  if (isRuntimeValue(value)) {
    const snapshot =
      ctx.interpreters.batchContext?.smartState?.snapshots.get(value);
    if (snapshot) return smartValueParam(ctx, type, snapshot);
    if (value.batchId !== ctx.interpreters.batchContext?.smartState?.plan.salt)
      throw new ErrorException(
        "runtime value belongs to a different smart batch",
      );
    if (
      /^(u?int)(\d*)$/.test(type.type) &&
      /^(u?int)(\d*)$/.test(value.abiType.type)
    ) {
      if (value.operand.scale)
        throw new ErrorException(
          "convert scaled runtime values to raw integer units before ABI encoding",
        );
      return guardAbiInteger(
        ctx,
        value.operand.param,
        value.operand.cat,
        type.type,
      );
    }
    if (formatParamType(type) !== formatParamType(value.abiType))
      throw new ErrorException(
        `runtime value is ${formatParamType(value.abiType)}, expected ${formatParamType(type)}`,
      );
    if (type.type === "address" || type.type === "bool") {
      const max = type.type === "bool" ? 1n : (1n << 160n) - 1n;
      return staticCallParam(
        ctx.core,
        encodeResolve(
          constrainWord(ctx, value.operand.param, constraint("Lte", max)),
        ),
      );
    }
    return value.operand.param;
  }
  if (!hasRuntimeValue(value))
    return rawParam(encodeAbiParameters([type], [coerceAbiValue(type, value)]));
  const array = type.type.match(/\[(\d*)\]$/);
  if (array) {
    if (!Array.isArray(value))
      throw new ErrorException(`expected ${type.type}`);
    if (array[1] && value.length !== Number(array[1]))
      throw new ErrorException(`expected ${array[1]} array elements`);
    const element = {
      ...type,
      type: type.type.slice(0, -array[0].length),
    } as AbiParameter;
    // A literal array has a build-time length; encode its typed elements as a tuple,
    // including the ABI head/length of a dynamic array when appropriate.
    const members = value.map((v) => smartValueParam(ctx, element, v));
    if (array[1]) {
      const body = encodeArgumentsParam(
        ctx,
        `(${members.map(() => formatParamType(element)).join(",")})`,
        members,
      );
      if (!isDynamicParam(element)) return body;
      return concatParams(ctx, [rawParam(toWord(32n)), body]);
    }
    const body = encodeArgumentsParam(
      ctx,
      `(${members.map(() => formatParamType(element)).join(",")})`,
      members,
    );
    return concatParams(ctx, [
      rawParam(`${toWord(32n)}${toWord(BigInt(value.length)).slice(2)}`),
      body,
    ]);
  }
  if (type.type === "tuple") {
    const fields = (type as any).components as AbiParameter[];
    const body = encodeArgumentsParam(
      ctx,
      `(${fields.map(formatParamType).join(",")})`,
      fields.map((f, i) =>
        smartValueParam(
          ctx,
          f,
          Array.isArray(value) ? value[i] : value[f.name ?? ""],
        ),
      ),
    );
    return isDynamicParam(type)
      ? concatParams(ctx, [rawParam(toWord(32n)), body])
      : body;
  }
  throw new ErrorException(`cannot construct runtime ${type.type}`);
}

function concatParams(ctx: CompileCtx, params: InputParam[]): InputParam {
  return concatenateResolved(ctx, params);
}

function storageNamespace(plan: SmartBatchPlan): Hex {
  return keccak256(
    encodePacked(
      ["address", "address"],
      [
        plan.account,
        plan.route === "delegatecall" ? plan.account : plan.executor,
      ],
    ),
  );
}

function capturedValue(
  ctx: CompileCtx,
  plan: SmartBatchPlan,
  slot: Hex,
  type: AbiParameter,
  offset: number,
  producer: number,
): RuntimeValue {
  const words = Array.from({ length: headWords(type) }, (_, i) =>
    staticCallParam(
      plan.storage,
      encodeFunctionData({
        abi: COMPOSABLE_STORAGE_ABI,
        functionName: "readStorage",
        args: [
          storageNamespace(plan),
          keccak256(
            encodePacked(["bytes32", "uint256"], [slot, BigInt(offset + i)]),
          ),
        ],
      }),
    ),
  );
  return Object.assign(
    runtimeValue(
      words.length === 1 ? words[0] : concatParams(ctx, words),
      type,
      plan.salt,
    ),
    { output: { step: producer, word: offset } },
  );
}

function rejectEnvelope(action: TransactionAction, plan: SmartBatchPlan): void {
  if (action.from && !isAddressEqual(action.from, plan.account))
    throw new ErrorException(
      "action sender does not match the smart-batch account",
    );
  if (action.chainId !== undefined && action.chainId !== plan.chainId)
    throw new ErrorException("smart batches cannot span chains");
  for (const key of [
    "gas",
    "nonce",
    "maxFeePerGas",
    "maxPriorityFeePerGas",
    "rpcUrl",
  ] as const)
    if (action[key] !== undefined)
      throw new ErrorException(
        `per-call ${key} is not supported inside a smart batch`,
      );
}

/** Combine lexical branches with all enclosing loop continuation flags. */
export function smartCondition(ctx: CompileCtx): RuntimeValue | undefined {
  const state = ctx.interpreters.batchContext?.smartState;
  if (!state) return;
  let condition = state.condition;
  for (let loop = state.loop; loop; loop = loop.parent) {
    for (const flag of [loop.active, loop.iteration]) {
      if (!flag) continue;
      condition = condition
        ? runtimeValue(
            staticCallParam(
              ctx.core,
              encodeCond(
                flag.operand.param,
                condition.operand.param,
                rawParam(toWord(0n)),
              ),
            ),
            { type: "bool" },
            state.plan.salt,
          )
        : flag;
    }
  }
  return condition;
}

export function createSmartBatchState(
  plan: SmartBatchPlan,
  interpreters: NodesInterpreters,
): SmartBatchState {
  const state: SmartBatchState = {
    plan,
    snapshots: new WeakMap(),
    async append(module, node, result) {
      if (result.primaryCall !== undefined && result.primaryCall < 0)
        result.primaryCall += result.actions.length;
      if (node.returnCapture && result.primaryCall === undefined) {
        if (result.actions.length !== 1)
          throw new ErrorException(
            "return capture requires a declared primary call",
          );
        result.primaryCall = 0;
      }
      if (
        node.returnCapture &&
        (result.primaryCall === undefined ||
          result.primaryCall < 0 ||
          result.primaryCall >= result.actions.length)
      )
        throw new ErrorException(
          "return capture has no primary transaction call",
        );
      const ctx = defaultCompileCtx(module, {
        ...interpreters,
        batchContext: {
          name: "smart batch",
          hasActions: true,
          smart: true,
          smartState: state,
        },
      });
      const condition = smartCondition(ctx);
      if (condition && node.returnCapture)
        throw new ErrorException(
          "return capture inside a runtime conditional requires an executor with conditional output storage",
        );
      for (let i = 0; i < result.actions.length; i++) {
        const action = result.actions[i];
        if (!isTransactionAction(action))
          throw new ErrorException(
            "smart batches accept transaction actions only",
          );
        rejectEnvelope(action, plan);
        const call = getEncodedCall(action);
        const capture =
          i === result.primaryCall ? node.returnCapture : undefined;
        const label = `${condition ? "conditional " : ""}${node.module ? `${node.module}:` : ""}${node.name}`;
        let execution: ComposableExecution;
        if (call && (action.plannedCall || capture)) {
          if (action.receiptCheck)
            throw new ErrorException(
              "runtime calls requiring an inner receipt outcome cannot be smart-batched",
            );
          if (!isRuntimeValue(call.target) && BigInt(call.target) === 0n)
            throw new ErrorException(
              "ERC-8211 cannot execute a typed call to the zero address",
            );
          if (action.operation === 1)
            throw new ErrorException(
              "dynamic delegatecalls and delegatecall return captures are unsupported",
            );
          if (call.args.length !== call.abi.inputs.length)
            throw new ErrorException(
              `${call.abi.name} expects ${call.abi.inputs.length} arguments`,
            );
          const args = call.args.map((v, n) =>
            smartValueParam(ctx, call.abi.inputs[n], v),
          );
          let target = smartValueParam(ctx, { type: "address" }, call.target);
          if (isRuntimeValue(call.target))
            target = staticCallParam(
              ctx.core,
              encodeResolve(constrainWord(ctx, target, constraint("Gte", 1n))),
            );
          const inputParams = [
            { ...target, paramType: PARAM_TYPE.Target },
            {
              ...smartValueParam(
                ctx,
                { type: "uint256" },
                call.value ?? action.value ?? 0n,
              ),
              paramType: PARAM_TYPE.Value,
            },
            ...(call.rawData
              ? [call.rawInput ?? rawParam(`0x${call.rawData.slice(10)}`)]
              : !hasRuntimeValue(call.args)
                ? [
                    rawParam(
                      encodeAbiParameters(
                        call.abi.inputs,
                        call.args.map((value, n) =>
                          coerceAbiValue(call.abi.inputs[n], value),
                        ),
                      ),
                    ),
                  ]
                : call.abi.inputs.every((input) => !isDynamicParam(input))
                  ? args
                  : [
                      encodeArgumentsParam(
                        ctx,
                        `(${call.abi.inputs.map(formatParamType).join(",")})`,
                        args,
                      ),
                    ]),
          ];
          execution = {
            functionSig: call.rawData
              ? (call.rawData.slice(0, 10) as Hex)
              : toFunctionSelector(call.abi),
            inputParams,
            outputParams: [],
          };
        } else {
          if (!action.to)
            throw new ErrorException(
              "plain CREATE deployments cannot be smart-batched",
            );
          const data = action.data ?? "0x";
          if (
            data.length < 10 ||
            BigInt(action.to) === 0n ||
            action.operation === 1 ||
            action.receiptCheck
          ) {
            if (condition)
              throw new ErrorException(
                "runtime conditionals require composable calls; short calldata and delegatecalls cannot be conditionally executed by this executor",
              );
            if (capture)
              throw new ErrorException(
                "return capture requires a typed CALL with declared ABI outputs",
              );
            plan.steps.push({
              kind: "transaction",
              action,
              label,
              line: node.loc?.start.line,
            });
            continue;
          }
          execution = {
            functionSig: data.slice(0, 10) as Hex,
            inputParams: [
              targetParam(action.to),
              {
                ...rawParam(toWord(action.value ?? 0n)),
                paramType: PARAM_TYPE.Value,
              },
              rawParam(`0x${data.slice(10)}`),
            ],
            outputParams: [],
          };
        }
        if (capture) {
          const outputs = call?.abi.outputs ?? [];
          if (!outputs.length)
            throw new ErrorException(
              "return capture requires ABI outputs; add returns (...) to the exec signature",
            );
          if (outputs.some(isDynamicParam))
            throw new ErrorException(
              "smart return capture supports static ABI results only",
            );
          const slot = keccak256(
            encodePacked(
              ["bytes32", "uint256"],
              [plan.salt, BigInt(plan.steps.length)],
            ),
          );
          const count = outputs.reduce(
            (sum, output) => sum + headWords(output),
            0,
          );
          execution.outputParams.push({
            fetcherType: 0,
            paramData: encodeAbiParameters(
              [{ type: "uint256" }, { type: "address" }, { type: "bytes32" }],
              [BigInt(count), plan.storage, slot],
            ),
          });
          const bind = (
            slots: DestructureSlot[],
            types: readonly AbiParameter[],
            start: number,
          ) => {
            if (slots.length > types.length)
              throw new ErrorException(
                "return capture has more slots than ABI outputs",
              );
            let offset = start;
            for (let n = 0; n < types.length; n++) {
              const type = types[n];
              const name = slots[n];
              if (Array.isArray(name)) {
                const match = type.type.match(/\[(\d+)\]$/);
                const fields =
                  type.type === "tuple"
                    ? (type as any).components
                    : match
                      ? Array.from({ length: Number(match[1]) }, () => ({
                          ...type,
                          type: type.type.slice(0, -match[0].length),
                        }))
                      : undefined;
                if (!fields)
                  throw new ErrorException(
                    "nested return destructuring requires a static tuple or array",
                  );
                bind(name, fields, offset);
              } else if (name) {
                module.bindingsManager.setBinding(
                  `$${name}`,
                  capturedValue(
                    ctx,
                    plan,
                    slot,
                    type,
                    offset,
                    plan.steps.length,
                  ) as any,
                  BindingsSpace.USER,
                  false,
                  undefined,
                  true,
                );
                plan.captures.push({
                  name,
                  type,
                  step: plan.steps.length,
                  word: offset,
                });
              }
              offset += headWords(type);
            }
          };
          bind(capture, outputs, 0);
        }
        if (condition) {
          execution.inputParams = execution.inputParams.map((param) => ({
            ...staticCallParam(
              ctx.core,
              encodeCond(
                condition!.operand.param,
                param,
                rawParam(
                  param.paramType === PARAM_TYPE.CallData ? "0x" : toWord(0n),
                ),
              ),
            ),
            paramType: param.paramType,
          }));
        }
        const dynamicFields: string[] = condition ? ["condition"] : [];
        const serializableValue = (
          value: any,
          field: string,
        ): SmartBatchValue => {
          if (isRuntimeValue(value)) {
            dynamicFields.push(field);
            // A prior approval snapshot is the value the call actually consumes.
            return structuredClone(state.snapshots.get(value) ?? value);
          }
          if (value instanceof Num) return value.toBigInt();
          if (typeof value === "number") return BigInt(value);
          if (Array.isArray(value))
            return value.map((v, n) => serializableValue(v, `${field}[${n}]`));
          if (value && typeof value === "object")
            return Object.fromEntries(
              Object.entries(value).map(([name, v]) => [
                name,
                serializableValue(v, `${field}.${name}`),
              ]),
            );
          return value;
        };
        if (call?.rawInput) dynamicFields.push("data");
        const typedCall = call
          ? {
              target: serializableValue(call.target, "target") as
                | Address
                | RuntimeValue,
              abi: call.abi,
              args: call.args.map((value, n) =>
                serializableValue(
                  value,
                  call.abi.inputs[n]?.name || `arg${n + 1}`,
                ),
              ),
              value: serializableValue(
                call.value ?? action.value ?? 0n,
                "value",
              ) as bigint | RuntimeValue,
              ...(call.rawData ? { rawData: call.rawData } : {}),
              ...(call.rawInput ? { rawInput: call.rawInput } : {}),
            }
          : undefined;
        const wire = JSON.stringify(execution).toLowerCase();
        const reads = plan.captures
          .filter((capture) => {
            if (capture.step >= plan.steps.length) return false;
            const slot = keccak256(
              encodePacked(
                ["bytes32", "uint256"],
                [plan.salt, BigInt(capture.step)],
              ),
            );
            return Array.from({ length: headWords(capture.type) }, (_, n) =>
              keccak256(
                encodePacked(
                  ["bytes32", "uint256"],
                  [slot, BigInt(capture.word + n)],
                ),
              ),
            ).some((key) => wire.includes(key.slice(2).toLowerCase()));
          })
          .map(({ name, step, word }) => ({ name, step, word }));
        plan.steps.push({
          kind: "composable",
          execution,
          ...(typedCall ? { call: typedCall } : {}),
          dynamicFields,
          ...(condition ? { condition: condition } : {}),
          reads,
          label,
          line: node.loc?.start.line,
        });
      }
    },
    async snapshot(ctx, value, options) {
      const condition = options?.control ? undefined : smartCondition(ctx);
      const previous = state.snapshots.get(value);
      if (previous) return previous;
      if (isDynamicParam(value.abiType))
        throw new ErrorException(
          "cross-call snapshots require static ABI values",
        );
      const slot = keccak256(
        encodePacked(
          ["bytes32", "uint256"],
          [plan.salt, BigInt(plan.steps.length)],
        ),
      );
      // A no-target executor entry can capture a STATIC_CALL without making a write call.
      const resolveAbi = parseAbi([
        "struct Constraint { uint8 constraintType; bytes referenceData; }",
        "struct InputParam { uint8 paramType; uint8 fetcherType; bytes paramData; Constraint[] constraints; }",
        "function resolve(InputParam param) view",
      ]);
      const data = encodeFunctionData({
        abi: resolveAbi,
        functionName: "resolve",
        args: [
          condition
            ? staticCallParam(
                ctx.core,
                encodeCond(
                  condition.operand.param,
                  value.operand.param,
                  rawParam(`0x${"00".repeat(32 * headWords(value.abiType))}`),
                ),
              )
            : value.operand.param,
        ],
      });
      plan.steps.push({
        kind: "composable",
        label: condition ? "conditional snapshot" : "snapshot runtime value",
        ...(condition ? { condition: condition } : {}),
        execution: {
          functionSig: "0x00000000",
          inputParams: [],
          outputParams: [
            {
              fetcherType: 1,
              paramData: encodeAbiParameters(
                [
                  { type: "uint256" },
                  { type: "address" },
                  { type: "bytes" },
                  { type: "address" },
                  { type: "bytes32" },
                ],
                [
                  BigInt(headWords(value.abiType)),
                  ctx.core,
                  data,
                  plan.storage,
                  slot,
                ],
              ),
            },
          ],
        },
      });
      const captured = capturedValue(
        ctx,
        plan,
        slot,
        value.abiType,
        0,
        plan.steps.length - 1,
      );
      if (value.operand.scale !== undefined)
        captured.operand.scale = value.operand.scale;
      // A skipped branch stores a zero fallback, which must never replace an
      // expression used later outside that branch.
      if (!condition) state.snapshots.set(value, captured);
      return captured;
    },
  };
  return state;
}

export async function compileSmartBatch(
  module: Module,
  block: BlockExpressionNode,
  interpreters: NodesInterpreters,
  options: {
    name: string;
    account: Address;
    route: SmartBatchPlan["route"];
    salt?: Hex;
    blockInitializer?: () => Promise<void>;
  },
): Promise<SmartBatchPlan> {
  const salt =
    options.salt ?? bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  if (!/^0x[\da-fA-F]{64}$/.test(salt))
    throw new ErrorException("--salt must be bytes32");
  const plan: SmartBatchPlan = {
    version: 1,
    salt,
    chainId: await module.getChainId(),
    account: options.account,
    route: options.route,
    executor: COMPOSABLE_EXECUTOR_ADDRESS,
    storage: COMPOSABLE_STORAGE_ADDRESS,
    steps: [],
    captures: [],
    dependencies: [],
  };
  const state = createSmartBatchState(plan, interpreters);
  module.bindingsManager.enterScope();
  try {
    await withSender(module, options.account, async () => {
      await interpreters.interpretNode(block, {
        batchContext: {
          name: options.name,
          smart: true,
          smartState: state,
          hasActions: false,
        },
        blockInitializer: options.blockInitializer,
      });
    });
  } finally {
    module.bindingsManager.exitScope();
  }
  const serialized = JSON.stringify(plan, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  ).toLowerCase();
  plan.dependencies = [
    CORE_ADDRESS,
    OPERATIONS_ADDRESS,
    COLLECTIONS_ADDRESS,
    EXPRESSIONS_ADDRESS,
  ].filter((address) => serialized.includes(address.slice(2).toLowerCase()));
  return plan;
}

/** Keep short calldata and explicit static delegatecalls outside ERC-8211. */
export function lowerSmartBatch(plan: SmartBatchPlan): TransactionAction[] {
  const actions: TransactionAction[] = [];
  let executions: ComposableExecution[] = [];
  const flush = () => {
    if (!executions.length) return;
    actions.push({
      to: plan.executor,
      value: 0n,
      data: encodeComposable(executions, plan.route),
      operation: plan.route === "delegatecall" ? 1 : 0,
    });
    executions = [];
  };
  for (const step of plan.steps) {
    if (step.kind === "composable") executions.push(step.execution);
    else {
      flush();
      actions.push(step.action);
    }
  }
  flush();
  return actions;
}

const activeContexts = new WeakMap<Module, CompileCtx>();
export function getSmartCompileContext(module: Module): CompileCtx | undefined {
  return activeContexts.get(module);
}
export async function withSmartCompileContext<T>(
  module: Module,
  ctx: CompileCtx,
  run: () => Promise<T>,
): Promise<T> {
  const previous = activeContexts.get(module);
  activeContexts.set(module, ctx);
  try {
    return await run();
  } finally {
    if (previous) activeContexts.set(module, previous);
    else activeContexts.delete(module);
  }
}
