import { concat, toHex, zeroAddress } from "viem";

import { ErrorException } from "../../../errors";

import type { Address } from "../../../types";
import type { Params } from "../types/permission";

/**
 * An address used for permission operations that denotes any type of Ethereum account.
 */
export const ANY_ENTITY: Address = `0xffffffffffffffffffffffffffffffffffffffff`;

/**
 * An address used for permission operations that denotes no Ethereum account.
 */
export const NO_ENTITY: Address = zeroAddress;

/**
 * An address used for permission operations that denotes that the permission has been burnt.
 */
export const BURN_ENTITY: Address = `0x0000000000000000000000000000000000000001`;

const Op = {
  NONE: 0,
  EQ: 1,
  NEQ: 2,
  GT: 3,
  LT: 4,
  GTE: 5,
  LTE: 6,
  RET: 7,
} as const;

const LogicOp = {
  NOT: 7,
  AND: 8,
  OR: 9,
  XOR: 10,
  IF_ELSE: 11,
} as const;

const SpecialArgId = {
  BLOCK_NUMBER: 200,
  TIMESTAMP: 201,
  // id = 202: not currently in use.
  ORACLE: 203,
  LOGIC_OP: 204,
  PARAM_VALUE: 205,
} as const;

// Normal argument

function arg(id: number): any {
  if (id < 0 || id > 199) {
    throw new ErrorException(
      `Argument id must be positive and can not be greater than 199`,
    );
  }
  return _arg(id);
}

// Block number

const blockNumber = _arg(SpecialArgId.BLOCK_NUMBER);

// Time stamp

const timestamp = _arg(SpecialArgId.TIMESTAMP);

// ACL oracle

function oracle(oracle: `0x${string}` | (() => `0x${string}`)): Params {
  return () => {
    const _oracle = typeof oracle === "string" ? oracle : oracle();
    return [_encodeParam(SpecialArgId.ORACLE, Op.EQ, _oracle)];
  };
}

// Logic functions

const logic = {
  not: (param: number): Params =>
    _encodeParams(SpecialArgId.LOGIC_OP, LogicOp.NOT, param),
  and: (param1: number, param2: number): Params =>
    _encodeParams(
      SpecialArgId.LOGIC_OP,
      LogicOp.AND,
      _encodeOperator(param1, param2),
    ),
  or: (param1: number, param2: number): Params =>
    _encodeParams(
      SpecialArgId.LOGIC_OP,
      LogicOp.OR,
      _encodeOperator(param1, param2),
    ),
  xor: (param1: number, param2: number): Params =>
    _encodeParams(
      SpecialArgId.LOGIC_OP,
      LogicOp.XOR,
      _encodeOperator(param1, param2),
    ),
  ifElse: (
    condition: number,
    successParam: number,
    failureParam: number,
  ): Params =>
    _encodeParams(
      SpecialArgId.LOGIC_OP,
      LogicOp.IF_ELSE,
      _encodeIfElse(condition, successParam, failureParam),
    ),
};

// Parameter value

const paramValue = _arg(SpecialArgId.PARAM_VALUE);

// Parameter logic composition

function encodeParams(param: Params): `0x${string}`[] {
  return param(0);
}

const not = _unaryLogicOp(logic.not);
const and = _binaryLogicOp(logic.and);
const or = _binaryLogicOp(logic.or);
const xor = _binaryLogicOp(logic.xor);
const iif = (
  param1: Params,
): { then: (param2: Params) => { else: (param3: Params) => Params } } => ({
  then: (param2: Params) => ({
    else: (param3: Params) => {
      return _ternaryLogicOp(logic.ifElse)(param1, param2, param3);
    },
  }),
});

// Private functions

function _arg(id: number) {
  return {
    none: (value: any) => _encodeParams(id, Op.NONE, value),
    eq: (value: any) => _encodeParams(id, Op.EQ, value),
    neq: (value: any) => _encodeParams(id, Op.NEQ, value),
    gt: (value: any) => _encodeParams(id, Op.GT, value),
    lt: (value: any) => _encodeParams(id, Op.LT, value),
    gte: (value: any) => _encodeParams(id, Op.GTE, value),
    lte: (value: any) => _encodeParams(id, Op.LTE, value),
    ret: (value: any) => _encodeParams(id, Op.RET, value),
  };
}

function _encodeParam(
  argId: number,
  op: number,
  value: number | `0x${string}`,
): `0x${string}` {
  const _argId = toHex(argId, { size: 1 });
  const _op = toHex(op, { size: 1 });
  const _value = typeof value === "string" ? value : toHex(value, { size: 30 });
  return concat([_argId, _op, _value]);
}

function _encodeParams(
  argId: number,
  op: number,
  value: number | `0x${string}`,
): Params {
  return () => [_encodeParam(argId, op, value)];
}

function _unaryLogicOp(
  op: (param1: number) => Params,
): (param: Params) => Params {
  return (param) => {
    return (index = 0) => {
      const index1 = index + 1;
      const _param = param(index1);
      return [...op(index1)(), ..._param];
    };
  };
}

function _binaryLogicOp(
  op: (param1: number, param2: number) => Params,
): (param1: Params, param2: Params) => Params {
  return (param1, param2) => {
    return (index = 0) => {
      const index1 = index + 1;
      const _param1 = param1(index1);
      const index2 = index1 + _param1.length;
      const _param2 = param2(index2);
      return [...op(index1, index2)(), ..._param1, ..._param2];
    };
  };
}

function _ternaryLogicOp(
  op: (param1: number, param2: number, param3: number) => Params,
): (param1: Params, param2: Params, param3: Params) => Params {
  return (param1, param2, param3) => {
    return (index = 0) => {
      const index1 = index + 1;
      const _param1 = param1(index1);
      const index2 = index1 + _param1.length;
      const _param2 = param2(index2);
      const index3 = index2 + _param2.length;
      const _param3 = param3(index3);
      return [
        ...op(index1, index2, index3)(),
        ..._param1,
        ..._param2,
        ..._param3,
      ];
    };
  };
}

function _encodeOperator(param1: number, param2: number): `0x${string}` {
  return _encodeIfElse(param1, param2, 0);
}

function _encodeIfElse(
  condition: number,
  successParam: number,
  failureParam: number,
): `0x${string}` {
  const _condition = toHex(condition, { size: 4 });
  const _successParam = toHex(successParam, { size: 4 });
  const _failureParam = toHex(failureParam, { size: 22 });
  return concat([_failureParam, _successParam, _condition]);
}

export {
  arg,
  blockNumber,
  timestamp,
  oracle,
  logic,
  paramValue,
  encodeParams,
  not,
  and,
  or,
  xor,
  iif,
};
