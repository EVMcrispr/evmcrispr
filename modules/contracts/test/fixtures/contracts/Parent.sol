// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "./Child.sol";

contract Parent is Child {
    function doubled() public view returns (uint256) {
        return base * 2;
    }
}
