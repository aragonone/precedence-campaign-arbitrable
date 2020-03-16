pragma solidity ^0.5.8;

import "@aragon/court/contracts/arbitration/IArbitrable.sol";
import "@aragon/court/contracts/arbitration/IArbitrator.sol";
import "@aragon/court/contracts/lib/os/ERC20.sol";


contract TreasuryMock {
    event Withdraw(ERC20 indexed token, address indexed to, uint256 amount);

    function withdraw(ERC20 _token, address _to, uint256 _amount) external {
        emit Withdraw(_token, _to, _amount);
    }
}

contract ArbitratorMock is IArbitrator {
    ERC20 feeToken;
    uint256 feeAmount;
    uint256 subscriptionAmount;
    uint256 lastDisputeId;
    TreasuryMock treasury;
    mapping(uint256 => address) arbitrables; // disputeId to subject
    mapping(uint256 => uint8) rulings; // disputeId to rulings

    event NewDispute(uint256 disputeId, uint256 possibleRulings, bytes metadata);
    event EvidencePeriodClosed(uint256 indexed disputeId);

    constructor(ERC20 _feeToken, uint256 _feeAmount, uint256 _subscriptionAmount) public {
        feeToken = _feeToken;
        feeAmount = _feeAmount;
        subscriptionAmount = _subscriptionAmount;
        treasury = new TreasuryMock();
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

    function getTreasury() external view returns (address) {
        return address(treasury);
    }
}
