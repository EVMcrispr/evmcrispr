pragma solidity 0.4.24;

import "@aragon/os/contracts/forwarding/IAbstractForwarder.sol";
import "@aragon/os/contracts/forwarding/IForwarderFee.sol";
import "@aragon/os/contracts/forwarding/IForwarderWithContext.sol";
import "@aragon/os/contracts/forwarding/IForwarder.sol";
import "@aragon/os/contracts/lib/token/ERC20.sol";

// You might think this file is a bit odd, but let me explain.
// We only use some contracts in our tests, which means Truffle
// will not compile it for us, because it is from an external
// dependency.
//
// We are now left with three options:
// - Copy/paste these contracts
// - Run the tests with `truffle compile --all` on
// - Or trick Truffle by claiming we use it in a Solidity test
//
// You know which one I went for.

contract TestImports {
    constructor() public {
        // solium-disable-previous-line no-empty-blocks
    }
}
