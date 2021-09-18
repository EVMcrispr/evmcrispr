import { BigNumber, utils } from "ethers";

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

type Param = (index: number) => string[];

// Normal argument

function arg(id: number): any {
  if (id < 0 || id > 199) {
    throw new Error(`Argument id must be positive and can not be greater than 199`);
  }
  return _arg(id);
}

// Block number

const blockNumber = _arg(SpecialArgId.BLOCK_NUMBER);

// Time stamp

const timestamp = _arg(SpecialArgId.TIMESTAMP);

// ACL oracle

function oracle(oracle: string): string {
  return _encodeParam(SpecialArgId.ORACLE, Op.EQ, oracle);
}

// Parameter value

const paramValue = _arg(SpecialArgId.PARAM_VALUE);

// Parameter logic composition

function encodeParams(param: Param): string[] {
  return param(0);
}

const not = _unaryLogicOp(LogicOp.NOT);
const and = _binaryLogicOp(LogicOp.AND);
const or = _binaryLogicOp(LogicOp.OR);
const xor = _binaryLogicOp(LogicOp.XOR);
const iif = (param1: string | Param): any => ({
  then: (param2: string | Param) => ({
    else: (param3: string | Param) => {
      return _ternaryLogicOp()(param1, param2, param3);
    },
  }),
});

// Private functions

function _arg(id: number) {
  return {
    none: (value: any) => _encodeParam(id, Op.NONE, value),
    eq: (value: any) => _encodeParam(id, Op.EQ, value),
    neq: (value: any) => _encodeParam(id, Op.NEQ, value),
    gt: (value: any) => _encodeParam(id, Op.GT, value),
    lt: (value: any) => _encodeParam(id, Op.LT, value),
    gte: (value: any) => _encodeParam(id, Op.GTE, value),
    lte: (value: any) => _encodeParam(id, Op.LTE, value),
    ret: (value: any) => _encodeParam(id, Op.RET, value),
  };
}

function _encodeParam(argId: number, op: number, value: any): string {
  const _argId = utils.hexlify(argId).slice(2);
  const _op = utils.hexlify(op).slice(2);
  const _value = utils.hexlify(BigNumber.from(value)).slice(2).padStart(60, "0"); // 60 as params are uint240

  return `0x${_argId}${_op}${_value}`;
}

function _resolveParam(param: string | Param, index: number): string[] {
  return typeof param === "string" ? [param] : param(index);
}

function _unaryLogicOp(op: any): (param: string | Param) => Param {
  return (param) => {
    return (index) => {
      const index1 = index + 1;
      const _param = _resolveParam(param, index1);
      return [op(index1), ..._param];
    };
  };
}

function _binaryLogicOp(op: any): (param1: string | Param, param2: string | Param) => Param {
  return (param1, param2) => {
    return (index) => {
      const index1 = index + 1;
      const _param1 = _resolveParam(param1, index1);
      const index2 = index1 + _param1.length;
      const _param2 = _resolveParam(param2, index2);
      return [op(index1, index2), ..._param1, ..._param2];
    };
  };
}

function _ternaryLogicOp(): (param1: string | Param, param2: string | Param, param3: string | Param) => Param {
  return (param1, param2, param3) => {
    return (index) => {
      const index1 = index + 1;
      const _param1 = _resolveParam(param1, index1);
      const index2 = index1 + _param1.length;
      const _param2 = _resolveParam(param2, index2);
      const index3 = index2 + _param2.length;
      const _param3 = _resolveParam(param3, index3);
      return [logic.ifElse(index1, index2, index3), ..._param1, ..._param2, ..._param3];
    };
  };
}

// function _encodeOperator(param1: number, param2: number): string {
//   return _encodeIfElse(param1, param2, 0);
// }

// function _encodeIfElse(condition: number, successParam: number, failureParam: number) {
//   const _condition = utils.hexlify(condition).slice(2).padStart(8, "0");
//   const _successParam = utils.hexlify(successParam).slice(2).padStart(8, "0");
//   const _failureParam = utils.hexlify(failureParam).slice(2).padStart(44, "0");
//   return `0x${_failureParam}${_successParam}${_condition}`;
// }

export { arg, blockNumber, timestamp, oracle, LogicOp, paramValue, encodeParams, not, and, or, xor, iif };
