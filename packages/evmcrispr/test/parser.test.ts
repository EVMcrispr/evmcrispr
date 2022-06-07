import {
  callParserDescribe,
  commandParserDescribe,
  helperParserDescribe,
  primaryParsersDescribe,
  scriptParserDescribe,
} from './parser-describes';
import { arrayParserDescribe } from './parser-describes/array.test';

describe('CAS11 Parsers', () => {
  primaryParsersDescribe();

  arrayParserDescribe();

  callParserDescribe();

  helperParserDescribe();

  commandParserDescribe();

  scriptParserDescribe();
});
