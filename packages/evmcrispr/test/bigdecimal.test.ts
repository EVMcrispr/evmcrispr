import { expect } from 'chai';
import { BigNumber } from 'ethers';

import { BigDecimal } from '../src/BigDecimal';

describe('BigDecimal', () => {
  it('should allow hex string input', () => {
    expect(BigDecimal.from('0xa').toString()).to.be.eq('10');
    expect(BigDecimal.from('10').toString()).to.be.eq('10');
  });

  it('should perform toHexString properly', () => {
    expect(BigDecimal.from(0).toHexString()).to.be.eq('0x0');
    expect(BigDecimal.from(1).toHexString()).to.be.eq('0x1');
    expect(BigDecimal.from(15).toHexString()).to.be.eq('0xf');
    expect(BigDecimal.from(16).toHexString()).to.be.eq('0x10');
  });

  it('should perform twosComplement', () => {
    const inputs = [
      { num: -3, bitCount: 3 },
      { num: 0, bitCount: 3 },
      { num: 3, bitCount: 3 },
    ];
    inputs.forEach(({ num, bitCount }) => {
      expect(BigDecimal.from(num).toTwos(bitCount).toString()).to.be.eq(
        BigNumber.from(num).toTwos(bitCount).toString(),
      );
    });
  });

  describe('arithmetic operations', () => {
    it('should be able to add two numbers', () => {
      expect(BigDecimal.from('2e18').add(1)).to.be.eq(
        BigNumber.from('2').mul(BigNumber.from(10).pow(18)).add(1),
      );
    });

    it('should be able to substract two numbers', () => {
      expect(BigDecimal.from('2e18').sub(1)).to.be.eq(
        BigNumber.from('2').mul(BigNumber.from(10).pow(18)).sub(1),
      );
    });

    it('should be able to multiply two numbers', () => {
      expect(BigDecimal.from('2e18').mul(10)).to.be.eq(
        BigNumber.from('2').mul(BigNumber.from(10).pow(18)).mul(10),
      );
    });

    it('should be able to divide two numbers', () => {
      expect(BigDecimal.from('2e18').div(10)).to.be.eq(
        BigNumber.from('2').mul(BigNumber.from(10).pow(18)).div(10),
      );
    });
    it('should be able to power two numbers', () => {
      expect(BigDecimal.from('2e18').pow(10)).to.be.eq(
        BigNumber.from('2').mul(BigNumber.from(10).pow(18)).pow(10),
      );
    });
  });

  describe('logic operations', () => {
    it('should be able to perform eq logic operations', () => {
      expect(BigDecimal.from('2e18').eq(BigDecimal.from('2e18'))).to.be.true;
      expect(BigDecimal.from('2e18').eq(BigDecimal.from('3e18'))).to.be.false;
    });
    it('should be able to perform lt logic operations', () => {
      expect(BigDecimal.from('1e18').lt(BigDecimal.from('2e18'))).to.be.true;
      expect(BigDecimal.from('2e18').lt(BigDecimal.from('2e18'))).to.be.false;
      expect(BigDecimal.from('2e18').lt(BigDecimal.from('1e18'))).to.be.false;
    });
    it('should be able to perform lte logic operations', () => {
      expect(BigDecimal.from('1e18').lte(BigDecimal.from('2e18'))).to.be.true;
      expect(BigDecimal.from('2e18').lte(BigDecimal.from('2e18'))).to.be.true;
      expect(BigDecimal.from('2e18').lte(BigDecimal.from('1e18'))).to.be.false;
    });
    it('should be able to perform gt logic operations', () => {
      expect(BigDecimal.from('2e18').gt(BigDecimal.from('1e18'))).to.be.true;
      expect(BigDecimal.from('2e18').gt(BigDecimal.from('2e18'))).to.be.false;
      expect(BigDecimal.from('1e18').gt(BigDecimal.from('2e18'))).to.be.false;
    });
    it('should be able to perform gte logic operations', () => {
      expect(BigDecimal.from('2e18').gte(BigDecimal.from('1e18'))).to.be.true;
      expect(BigDecimal.from('2e18').gte(BigDecimal.from('2e18'))).to.be.true;
      expect(BigDecimal.from('1e18').gte(BigDecimal.from('2e18'))).to.be.false;
    });
  });
});
