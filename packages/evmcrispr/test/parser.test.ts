import {
  callParserDescribe,
  helperParserDescribe,
  primaryParsersDescribe,
} from './parsers';

describe('cas11 parsers', () => {
  primaryParsersDescribe();

  callParserDescribe();

  helperParserDescribe();
});
