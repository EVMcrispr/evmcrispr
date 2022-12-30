import { expect } from 'chai';

import type { Params } from '../src/types';
import {
  and,
  arg,
  blockNumber,
  encodeParams,
  iif,
  logic,
  not,
  or,
  oracle,
  paramValue,
  timestamp,
  xor,
} from '../src/utils/acl';

function onlyParam(param: Params): string {
  const _param = param(0);
  if (_param.length != 1) {
    throw new Error('Params should only be one.');
  }
  return _param[0];
}

function checkArg(arg: any, argId: string) {
  expect(onlyParam(arg.none(0)).slice(0, 6)).eql(`0x${argId}00`);
  expect(onlyParam(arg.eq(0)).slice(0, 6)).eql(`0x${argId}01`);
  expect(onlyParam(arg.neq(0)).slice(0, 6)).eql(`0x${argId}02`);
  expect(onlyParam(arg.gt(0)).slice(0, 6)).eql(`0x${argId}03`);
  expect(onlyParam(arg.lt(0)).slice(0, 6)).eql(`0x${argId}04`);
  expect(onlyParam(arg.gte(0)).slice(0, 6)).eql(`0x${argId}05`);
  expect(onlyParam(arg.lte(0)).slice(0, 6)).eql(`0x${argId}06`);
  expect(onlyParam(arg.ret(0)).slice(0, 6)).eql(`0x${argId}07`);
}

describe('AragonOS > ACL utils', () => {
  it('encodes arguments properly', () => {
    expect(onlyParam(arg(0).eq(6)).startsWith('0x00')).to.be.true;
    expect(onlyParam(arg(88).eq(6)).startsWith('0x58')).to.be.true;
  });

  it('fails when argument is >=200', () => {
    expect(() => arg(200).gt(6)).to.throw(
      `Argument id must be positive and can not be greater than 199`,
    );
  });

  it('encodes operations properly', () => {
    checkArg(arg(100), '64');
  });

  it('blocknumber special argument is encoded properly', () => {
    checkArg(blockNumber, 'c8');
  });

  it('timestamp special argument is encoded properly', () => {
    checkArg(timestamp, 'c9');
  });

  it('oracle special argument is encoded properly', () => {
    expect(
      onlyParam(oracle('0x71C7656EC7ab88b098defB751B7401B5f6d8976F')).slice(
        0,
        6,
      ),
    ).eql('0xcb01');
    expect(
      onlyParam(oracle('0x71C7656EC7ab88b098defB751B7401B5f6d8976F')).endsWith(
        '71c7656ec7ab88b098defb751b7401b5f6d8976f',
      ),
    );
  });

  it('oracle special argument can resolve a function', () => {
    expect(
      onlyParam(
        oracle(() => '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'),
      ).endsWith('71c7656ec7ab88b098defb751b7401b5f6d8976f'),
    );
  });

  it('logic operations are encoded properly', () => {
    const logicArgId = '0xcc';
    const not = '07';
    const and = '08';
    const or = '09';
    const xor = '0a';
    const ifElse = '0b';
    const param1 = '16'; // 22 in hex
    const param2 = '37'; // 55 in hex
    const param3 = '63'; // 99 in hex
    expect(onlyParam(logic.not(22))).eql(
      `${logicArgId}${not}0000000000000000000000000000000000000000000000000000000000${param1}`,
    );
    expect(onlyParam(logic.and(22, 55))).eql(
      `${logicArgId}${and}00000000000000000000000000000000000000000000000000${param2}000000${param1}`,
    );
    expect(onlyParam(logic.or(22, 55))).eql(
      `${logicArgId}${or}00000000000000000000000000000000000000000000000000${param2}000000${param1}`,
    );
    expect(onlyParam(logic.xor(22, 55))).eql(
      `${logicArgId}${xor}00000000000000000000000000000000000000000000000000${param2}000000${param1}`,
    );
    expect(onlyParam(logic.ifElse(22, 55, 99))).eql(
      `${logicArgId}${ifElse}000000000000000000000000000000000000000000${param3}000000${param2}000000${param1}`,
    );
  });

  it('parameter values are encoded properly', () => {
    checkArg(paramValue, 'cd');
  });

  it('complex logic operations are encoded properly', () => {
    expect(
      encodeParams(
        iif(
          and(
            oracle('0x71C7656EC7ab88b098defB751B7401B5f6d8976F'),
            blockNumber.gt(18137519),
          ),
        )
          .then(
            or(
              xor(
                not(oracle('0x71C7656EC7ab88b098defB751B7401B5f6d8976F')),
                arg(1).none(0),
              ),
              arg(0).lt(10),
            ),
          )
          .else(paramValue.ret(0)),
      ),
    ).deep.eq([
      /*  0 */ onlyParam(logic.ifElse(1, 4, 10)),
      /*  1 */ onlyParam(logic.and(2, 3)),
      /*  2 */ onlyParam(oracle('0x71C7656EC7ab88b098defB751B7401B5f6d8976F')),
      /*  3 */ onlyParam(blockNumber.gt(18137519)),
      /*  4 */ onlyParam(logic.or(5, 9)),
      /*  5 */ onlyParam(logic.xor(6, 8)),
      /*  6 */ onlyParam(logic.not(7)),
      /*  7 */ onlyParam(oracle('0x71C7656EC7ab88b098defB751B7401B5f6d8976F')),
      /*  8 */ onlyParam(arg(1).none(0)),
      /*  9 */ onlyParam(arg(0).lt(10)),
      /* 10 */ onlyParam(paramValue.ret(0)),
    ]);
  });
});
