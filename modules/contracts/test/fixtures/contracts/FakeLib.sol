// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./FakeUtil.sol";

library FakeLib {
    function twice(uint256 x) internal pure returns (uint256) {
        return FakeUtil.add(x, x);
    }
}
