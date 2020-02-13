pragma solidity ^0.5.8;

import "@aragon/court/contracts/arbitration/IArbitrable.sol";
import "@aragon/court/contracts/arbitration/IArbitrator.sol";
import "@aragon/court/contracts/lib/os/ERC20.sol";


contract ArbitratorMock is IArbitrator {
    uint256 lastDisputeId;
    mapping(uint256 => address) arbitrables; // disputeId to subject
    mapping(uint256 => uint8) rulings; // disputeId to rulings
    ERC20 feeToken;
    uint256 feeAmount;
    uint256 subscriptionAmount;

    event NewDispute(uint256 disputeId, uint256 possibleRulings, bytes metadata);
    event EvidencePeriodClosed(uint256 indexed disputeId);

    constructor(ERC20 _feeToken, uint256 _feeAmount, uint256 _subscriptionAmount) public {
        feeToken = _feeToken;
        feeAmount = _feeAmount;
        subscriptionAmount = _subscriptionAmount;
    }

    function createDispute(uint256 _possibleRulings, bytes calldata _metadata) external returns (uint256) {
        uint256 disputeId = lastDisputeId;
        arbitrables[disputeId] = msg.sender;
        lastDisputeId = disputeId + 1;

        (,,uint256 amount) = getDisputeFees();
        feeToken.transferFrom(msg.sender, address(this), amount);

        emit NewDispute(disputeId, _possibleRulings, _metadata);

        return disputeId;
    }

    function closeEvidencePeriod(uint256 _disputeId) external {
        emit EvidencePeriodClosed(_disputeId);
    }

    function executeRuling(uint256 _disputeId) external {
        IArbitrable(arbitrables[_disputeId]).rule(_disputeId, rulings[_disputeId]);
    }

    function setRuling(uint256 _disputeId, uint8 _ruling) external {
        rulings[_disputeId] = _ruling;
    }

    function getSubscriptionFees(address) external view returns (address, ERC20, uint256) {
        return (address(this), feeToken, subscriptionAmount);
    }

    function getDisputeFees() public view returns (address, ERC20, uint256) {
        return (address(this), feeToken, feeAmount);
    }
}
