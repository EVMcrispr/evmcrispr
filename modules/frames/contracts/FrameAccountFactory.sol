// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

/// Makes frame accounts: CREATE2 clones of one FrameAccount implementation, each carrying its owner as its
/// immutable argument, so an account's address follows from its owner and a salt.
contract FrameAccountFactory {
    address public immutable implementation;

    event AccountCreated(address indexed owner, uint256 salt, address account);

    constructor(address implementation_) {
        implementation = implementation_;
    }

    error ZeroOwner();

    /// The owner's account for this salt, created when it does not exist yet.
    function createAccount(address owner, uint256 salt) external returns (address account) {
        if (owner == address(0)) revert ZeroOwner();
        account = getAddress(owner, salt);
        if (account.code.length > 0) return account;
        Clones.cloneDeterministicWithImmutableArgs(implementation, abi.encode(owner), bytes32(salt));
        emit AccountCreated(owner, salt, account);
    }

    function getAddress(address owner, uint256 salt) public view returns (address) {
        return Clones.predictDeterministicAddressWithImmutableArgs(implementation, abi.encode(owner), bytes32(salt));
    }
}
