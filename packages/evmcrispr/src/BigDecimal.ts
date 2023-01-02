import Big from 'big.js';
import type { BigNumberish } from 'ethers';
import { BigNumber } from 'ethers';
import type { Hexable } from 'ethers/lib/utils';
import { hexlify, isBytes, isHexString } from 'ethers/lib/utils';

export type BigDecimalish = BigNumberish | BigDecimal;

export function isBigDecimalish(value: any): value is BigDecimalish {
  return (
    value != null &&
    (BigNumber.isBigNumber(value) ||
      typeof value === 'number' ||
      (typeof value === 'string' && !!value.match(/^-?\d+(\.\d+)?$/)) ||
      isHexString(value) ||
      typeof value === 'bigint' ||
      isBytes(value) ||
      value instanceof BigDecimal)
  );
}

/**
 * A wrapper around [big.js](https://github.com/MikeMcl/big.js) which expands scientific notation and creates a "toHexString" function.
 * This is the return type of every operation on ether, wei, etc.
 */
export class BigDecimal implements Hexable {
  _value: Big;
  private constructor(value: BigDecimalish | Big) {
    if (BigNumber.isBigNumber(value)) {
      value = value.toHexString();
    }
    if (typeof value === 'string' && value.startsWith('0x')) {
      value = BigInt(value).toString();
    }
    if (typeof value === 'bigint') {
      value = value.toString();
    }
    if (isBytes(value)) {
      value = hexlify(value);
    }
    if (value instanceof BigDecimal) {
      this._value = value._value;
    } else {
      this._value = new Big(value);
    }
  }

  #arithmeticOp(
    op: 'add' | 'sub' | 'mul' | 'div',
    other: BigDecimalish,
  ): BigDecimal {
    return new BigDecimal(this._value[op](new BigDecimal(other)._value));
  }

  #logicOp(
    op: 'eq' | 'lt' | 'lte' | 'gt' | 'gte',
    other: BigDecimalish,
  ): boolean {
    return this._value[op](new BigDecimal(other)._value);
  }

  static from(value: BigDecimalish): BigDecimal {
    return new BigDecimal(value);
  }

  add(other: BigDecimalish): BigDecimal {
    return this.#arithmeticOp('add', other);
  }

  sub(other: BigDecimalish): BigDecimal {
    return this.#arithmeticOp('sub', other);
  }

  mul(other: BigDecimalish): BigDecimal {
    return this.#arithmeticOp('mul', other);
  }

  div(other: BigDecimalish): BigDecimal {
    return this.#arithmeticOp('div', other);
  }

  pow(other: BigDecimalish): BigDecimal {
    return new BigDecimal(this._value.pow(new BigDecimal(other).toNumber()));
  }

  eq(other: BigDecimalish): boolean {
    return this.#logicOp('eq', other);
  }

  lt(other: BigDecimalish): boolean {
    return this.#logicOp('lt', other);
  }

  lte(other: BigDecimalish): boolean {
    return this.#logicOp('lte', other);
  }

  gt(other: BigDecimalish): boolean {
    return this.#logicOp('gt', other);
  }

  gte(other: BigDecimalish): boolean {
    return this.#logicOp('gte', other);
  }

  /**
   * Used anytime you're passing in "value" to ethers or web3
   *
   * @returns the BigDecimal represented as a hex string
   * @example
   * ```js
   * new BigDecimal(293).toHexString();
   * // '0x125'
   * ```
   * @example
   * ```js
   * new BigDecimal(681365874).toHexString();
   * // '0x289cd172'
   */
  toHexString(): string {
    return `0x${BigInt(this._value.toFixed(0, Big.roundDown)).toString(16)}`;
  }

  toNumber(): number {
    return Number(this._value.toFixed());
  }

  toString(): string {
    return this._value.toFixed();
  }

  /**
   * Eithers pads or shortens a string to a specified length
   *
   * @param str the string to pad or chop
   * @param padChar the character to pad the string with
   * @param length the desired length of the given string
   * @returns a string of the desired length, either padded with the specified padChar or with the beginning of the string chopped off
   * @example
   * ```javascript
   * padAndChop('essential-eth', 'a', 8);
   * // 'tial-eth'
   * ```
   * @example
   * ```javascript
   * padAndChop('essential-eth', 'A', 20);
   * // 'AAAAAAAessential-eth'
   * ```
   */
  private padAndChop(str: string, padChar: string, length: number): string {
    return (Array(length).fill(padChar).join('') + str).slice(length * -1);
  }

  public toTwos(bitCount: number): BigDecimal {
    let binaryStr;

    if (this.gte(0)) {
      const twosComp = this.toNumber().toString(2);
      binaryStr = this.padAndChop(twosComp, '0', bitCount || twosComp.length);
    } else {
      binaryStr = this.add(Math.pow(2, bitCount)).toNumber().toString(2);

      if (Number(binaryStr) < 0) {
        throw new Error('Cannot calculate twos complement');
      }
    }

    const binary = `0b${binaryStr}`;
    const decimal = Number(binary);
    return new BigDecimal(decimal);
  }
}
