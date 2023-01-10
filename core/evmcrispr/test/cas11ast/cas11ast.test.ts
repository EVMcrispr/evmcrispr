import type { Case } from '@1hive/evmcrispr-test-common';
import { DAO, DAO2, DAO3 } from '@1hive/evmcrispr-test-common';

import type { Cas11AST } from '../../src/Cas11AST';
import { parseScript } from '../../src/parsers/script';

describe.concurrent('Cas11AST', () => {
  const script = `
    load aragonos as ar
    load giveth as giv

    ar:connect ${DAO.kernel} (
      set $dao1Variable agent
      connect ${DAO2.kernel} (
        set $dao2Variable vault
        install vault:new
      )
    )

    ar:connect ${DAO3} (
      revoke voting token-manager MINT_ROLE
    )

    set $globalScopeVariable "test"
  `;
  let ast: Cas11AST;

  beforeEach(() => {
    ast = parseScript(script).ast;
  });

  describe.concurrent('when fetching a command at a specific line', () => {
    it('should fetch it correctly', () => {
      expect(ast.getCommandAtLine(9)).toMatchSnapshot();
    });

    describe.concurrent.each<Case<number>>([
      {
        title: 'a line higher than the maximum script line',
        value: 30,
      },
      { title: 'an empty line', value: 4 },
      { title: 'a line without a command', value: 10 },
    ])('', ({ title, value }) => {
      it(`should return nothing when given ${title}`, () => {
        expect(ast.getCommandAtLine(value)).to.be.undefined;
      });
    });
  });

  describe.concurrent('when fetching commands until a specific line', () => {
    it('should fetch them correctly', () => {
      expect(ast.getCommandsUntilLine(12)).toMatchSnapshot();
    });

    describe.concurrent(
      'when given a set of global scope command names',
      () => {
        it('should fetch them correctly', () => {
          expect(
            ast.getCommandsUntilLine(9, ['load', 'set']),
          ).toMatchSnapshot();
        });

        it('should fetch them correctly when giving a line higher than the maximum script line', () => {
          expect(
            ast.getCommandsUntilLine(200, ['load', 'set']),
          ).toMatchSnapshot();
        });
      },
    );
  });
});
