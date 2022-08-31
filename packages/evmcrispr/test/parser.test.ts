import {
  arithmeticParserDescribe,
  arrayParserDescribe,
  callParserDescribe,
  commandParserDescribe,
  commentParserDescribe,
  helperParserDescribe,
  primaryParsersDescribe,
  scriptParserDescribe,
} from './parser-describes';

describe('CAS11 Parsers', () => {
  arithmeticParserDescribe();

  arrayParserDescribe();

  callParserDescribe();

  commandParserDescribe();

  commentParserDescribe();

  helperParserDescribe();

  primaryParsersDescribe();

  scriptParserDescribe();
});
