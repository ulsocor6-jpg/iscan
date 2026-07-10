// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./DepositForwarder.sol";

/// @title ForwarderFactory
/// @notice Deploys DepositForwarder instances via CREATE2 so each user's
/// deposit address is computable off-chain (in hdWalletService.js) before
/// the contract is ever deployed — exactly like HD wallet derivation gave
/// an address ahead of funding, but with no private key anywhere in the
/// system. Rotating `treasury` or the token list never changes previously
/// computed deposit addresses, since neither is part of the contract's
/// init code — both are read back from the factory at runtime instead.
contract ForwarderFactory {
    address public owner;
    address public treasury;
    address[] public tokens;

    event Deployed(bytes32 indexed salt, address indexed forwarder);
    event TreasuryUpdated(address indexed newTreasury);
    event TokenAdded(address indexed token);
    event TokenRemoved(address indexed token);
    event OwnerUpdated(address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "ForwarderFactory: not owner");
        _;
    }

    constructor(address _treasury) {
        require(_treasury != address(0), "ForwarderFactory: zero treasury");
        owner = msg.sender;
        treasury = _treasury;
    }

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

    function tokenAt(uint256 i) external view returns (address) {
        return tokens[i];
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "ForwarderFactory: zero treasury");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function addToken(address token) external onlyOwner {
        require(token != address(0), "ForwarderFactory: zero token");
        for (uint256 i = 0; i < tokens.length; i++) {
            require(tokens[i] != token, "ForwarderFactory: token already added");
        }
        tokens.push(token);
        emit TokenAdded(token);
    }

    function removeToken(address token) external onlyOwner {
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == token) {
                tokens[i] = tokens[tokens.length - 1];
                tokens.pop();
                emit TokenRemoved(token);
                return;
            }
        }
        revert("ForwarderFactory: token not found");
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ForwarderFactory: zero owner");
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }

    /// @notice Compute the deposit address for a given salt WITHOUT
    /// deploying anything. Mirrors ethers.js's getCreate2Address so the
    /// backend can show a user their deposit address the instant their
    /// wallet record is created — exactly as HD derivation did before.
    function computeAddress(bytes32 salt) public view returns (address) {
        bytes memory initCode = type(DepositForwarder).creationCode;
        bytes32 initCodeHash = keccak256(initCode);
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash)
        );
        return address(uint160(uint256(hash)));
    }

    /// @notice Deploy (if not already deployed) the forwarder for `salt`.
    /// The constructor sweeps automatically, so calling this both creates
    /// the address (first use) and sweeps it (every use) in one
    /// transaction. Callable by anyone for the same reason
    /// DepositForwarder.sweep() is unrestricted: funds can only ever land
    /// at `treasury`.
    function deploy(bytes32 salt) external returns (address forwarder) {
        forwarder = computeAddress(salt);

        if (forwarder.code.length > 0) {
            // Already deployed — just sweep again for any new deposits.
            DepositForwarder(payable(forwarder)).sweep();
            return forwarder;
        }

        address deployed = address(new DepositForwarder{salt: salt}());
        require(deployed == forwarder, "ForwarderFactory: address mismatch");
        emit Deployed(salt, deployed);
    }
}
