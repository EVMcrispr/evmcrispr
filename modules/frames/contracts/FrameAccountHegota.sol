// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {HegotaSupport, Devnet, Scope, TxParam} from "@forshtat/hegota-support/contracts/HegotaSupport.sol";
import {
    IERC7579AccountConfig,
    IERC7579Execution,
    IERC7579Module,
    IERC7579ModuleConfig,
    MODULE_TYPE_EXECUTOR
} from "@openzeppelin/contracts/interfaces/draft-IERC7579.sol";
import {
    CallType, ERC7579Utils, ExecType, Mode
} from "@openzeppelin/contracts/account/utils/draft-ERC7579Utils.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ERC7739} from "@openzeppelin/contracts/utils/cryptography/signers/draft-ERC7739.sol";

/// A frame account: the sender of EIP-8141 frame transactions its owner authorizes with an EIP-712 signature
/// over the transaction's signature hash (an ARBITRARY signature entry, index 0). Deployed once per chain as an
/// implementation and used through clones made by FrameAccountFactory; each clone carries its owner as its
/// immutable argument. An ERC-7579 account as far as single and batch execution and executor modules go;
/// ERC-1271 through ERC-7739, so a signature made for one account is not valid for another of the same owner.
/// The same account built for the Hegota devnet (hegota-support's EIP7906_WORKSHOP), where ethrex numbers
/// SIGDATACOPY 0xba (0xb5 is EIP-8272's RECENTROOTREFLOAD there), an opcode hegota-support 0.0.1 has no helper
/// for: the account deploys its own.
contract FrameAccountHegota is
    HegotaSupport(Devnet.EIP7906_WORKSHOP),
    EIP712("EVMcrispr Frame Account", "1"),
    ERC7739,
    ERC721Holder,
    ERC1155Holder,
    IERC7579Execution,
    IERC7579AccountConfig,
    IERC7579ModuleConfig
{
    using ERC7579Utils for Mode;
    using ERC7579Utils for bytes;

    error Unauthorized();
    error NotAClone();
    error UnsupportedExecutionMode(bytes32 mode);
    error UnsupportedModuleType(uint256 moduleTypeId);

    bytes32 private constant FRAME_TRANSACTION_TYPEHASH = keccak256("FrameTransaction(bytes32 sigHash)");

    /// The implementation's own address: only its clones are accounts.
    address private immutable _implementation = address(this);

    mapping(address module => bool) private _executors;

    /// SIGDATACOPY at 0xba, called like hegota-support's helpers: abi.encode(dataOffset, length, signatureIndex)
    /// in, the bytes out. Runtime: SIGDATACOPY(0, dataOffset, length, signatureIndex); RETURN(0, length).
    address private immutable _SIG_DATA_COPY_0XBA = _deploySigDataCopy();

    function _deploySigDataCopy() private returns (address helper) {
        bytes memory code = hex"6012600d60003960126000f3fe6040356020356000356000ba6020356000f3";
        assembly ("memory-safe") {
            helper := create(0, add(code, 0x20), mload(code))
        }
        require(helper != address(0), "helper");
    }

    function _sigdatacopy(uint256 dataOffset, uint256 length, uint256 signatureIndex)
        private
        view
        returns (bytes memory output)
    {
        bool ok;
        (ok, output) = _SIG_DATA_COPY_0XBA.staticcall(abi.encode(dataOffset, length, signatureIndex));
        if (!ok) {
            assembly ("memory-safe") {
                revert(add(output, 0x20), mload(output))
            }
        }
    }

    modifier onlySelf() {
        if (msg.sender != address(this)) revert Unauthorized();
        _;
    }

    receive() external payable {}

    /// The owner, from the clone's immutable argument.
    function owner() public view returns (address) {
        if (address(this) == _implementation) revert NotAClone();
        return abi.decode(Clones.fetchCloneArgs(address(this)), (address));
    }

    /// The VERIFY frame lands here, with the scope its flags allow (execution, or execution and payment).
    function verify(uint8 scope) external {
        bytes32 sigHash = bytes32(txparam(TxParam.SIG_HASH));
        bytes memory signature = _sigdatacopy(0, 65, 0);
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(FRAME_TRANSACTION_TYPEHASH, sigHash)));
        // Only the canonical form of a signature (low s, v 27 or 28), as OpenZeppelin's ECDSA checks.
        (address signer, ECDSA.RecoverError error,) = ECDSA.tryRecover(digest, signature);
        require(error == ECDSA.RecoverError.NoError && signer == owner(), "bad signature");
        approve(Scope(scope));
    }

    // ------------------------------------------------------------------------------------------- ERC-7579 -----

    function execute(bytes32 mode, bytes calldata executionCalldata) external payable onlySelf {
        _execute(Mode.wrap(mode), executionCalldata);
    }

    function executeFromExecutor(bytes32 mode, bytes calldata executionCalldata)
        external
        payable
        returns (bytes[] memory returnData)
    {
        if (!_executors[msg.sender]) revert Unauthorized();
        return _execute(Mode.wrap(mode), executionCalldata);
    }

    function installModule(uint256 moduleTypeId, address module, bytes calldata initData) external onlySelf {
        if (moduleTypeId != MODULE_TYPE_EXECUTOR) revert UnsupportedModuleType(moduleTypeId);
        _executors[module] = true;
        IERC7579Module(module).onInstall(initData);
        emit ModuleInstalled(moduleTypeId, module);
    }

    function uninstallModule(uint256 moduleTypeId, address module, bytes calldata deInitData) external onlySelf {
        if (moduleTypeId != MODULE_TYPE_EXECUTOR) revert UnsupportedModuleType(moduleTypeId);
        _executors[module] = false;
        IERC7579Module(module).onUninstall(deInitData);
        emit ModuleUninstalled(moduleTypeId, module);
    }

    function isModuleInstalled(uint256 moduleTypeId, address module, bytes calldata)
        external
        view
        returns (bool)
    {
        return moduleTypeId == MODULE_TYPE_EXECUTOR && _executors[module];
    }

    function supportsModule(uint256 moduleTypeId) external pure returns (bool) {
        return moduleTypeId == MODULE_TYPE_EXECUTOR;
    }

    function supportsExecutionMode(bytes32 encodedMode) public pure returns (bool) {
        (CallType callType, ExecType execType,,) = Mode.wrap(encodedMode).decodeMode();
        return (callType == ERC7579Utils.CALLTYPE_SINGLE || callType == ERC7579Utils.CALLTYPE_BATCH)
            && execType == ERC7579Utils.EXECTYPE_DEFAULT;
    }

    function accountId() external pure returns (string memory) {
        return "evmcrispr.frame-account.2.0.0";
    }

    function _execute(Mode mode, bytes calldata executionCalldata) private returns (bytes[] memory) {
        if (!supportsExecutionMode(Mode.unwrap(mode))) revert UnsupportedExecutionMode(Mode.unwrap(mode));
        (CallType callType, ExecType execType,,) = mode.decodeMode();
        return callType == ERC7579Utils.CALLTYPE_SINGLE
            ? executionCalldata.execSingle(execType)
            : executionCalldata.execBatch(execType);
    }

    // ------------------------------------------------------------------------------------------- ERC-1271 -----

    /// ERC-7739's nested hash, signed by the owner.
    function _rawSignatureValidation(bytes32 hash, bytes calldata signature) internal view override returns (bool) {
        (address signer, ECDSA.RecoverError error,) = ECDSA.tryRecover(hash, signature);
        return error == ECDSA.RecoverError.NoError && signer == owner();
    }
}
