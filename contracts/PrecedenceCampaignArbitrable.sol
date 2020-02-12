pragma solidity ^0.5.8;

import "@aragon/court/contracts/arbitration/IArbitrable.sol";
import "@aragon/court/contracts/arbitration/IArbitrator.sol";


contract PrecedenceCampaignArbitrable is IArbitrable {
    //bytes4 public constant ERC165_INTERFACE = ERC165_INTERFACE_ID;
    //bytes4 public constant ARBITRABLE_INTERFACE = ARBITRABLE_INTERFACE_ID;
    string public constant ERROR_NOT_ALLOWED = "PCA_NOT_ALLOWED";

    address public owner;
    IArbitrator public arbitrator;

    modifier only(address _who) {
        require(msg.sender == _who, ERROR_NOT_ALLOWED);
        _;
    }

    constructor (address _owner, IArbitrator _arbitrator) public {
        owner = _owner;
        arbitrator = _arbitrator;
    }

    function createDispute(uint8 _possibleRulings, bytes calldata _metadata) external only(owner) {
        _createDispute(_possibleRulings, _metadata);
    }

    function submitEvidence(uint256 _disputeId, bytes calldata _evidence, bool _finished) external only(owner) {
        _submitEvidence(_disputeId, msg.sender, _evidence, _finished);
    }

    function forwardEvidence(uint256 _disputeId, address _submitter, bytes calldata _evidence, bool _finished) external only(owner) {
        _submitEvidence(_disputeId, _submitter, _evidence, _finished);
    }

    function createAndSubmit(
        uint8 _possibleRulings,
        bytes calldata _metadata,
        address _submitter1,
        address _submitter2,
        bytes calldata _evidence1,
        bytes calldata _evidence2
    )
        external
        only(owner)
    {
        uint256 disputeId = _createDispute(_possibleRulings, _metadata);
        _submitEvidence(disputeId, _submitter1, _evidence1, false);
        _submitEvidence(disputeId, _submitter2, _evidence2, false);
    }

    function closeEvidencePeriod(uint256 _disputeId) external only(owner) {
        arbitrator.closeEvidencePeriod(_disputeId);
    }

    function rule(uint256 _disputeId, uint256 _ruling) external only(address(arbitrator)) {
        emit Ruled(IArbitrator(msg.sender), _disputeId, _ruling);
    }

    function interfaceID() external pure returns (bytes4) {
        IArbitrable arbitrable;
        return arbitrable.submitEvidence.selector ^ arbitrable.rule.selector;
    }

    function _createDispute(uint8 _possibleRulings, bytes memory _metadata) internal returns (uint256) {
        (address recipient, ERC20 feeToken, uint256 disputeFees) = arbitrator.getDisputeFees();
        feeToken.approve(recipient, disputeFees);
        return arbitrator.createDispute(_possibleRulings, _metadata);
    }

    function _submitEvidence(uint256 _disputeId, address _submitter, bytes memory _evidence, bool _finished) internal {
        emit EvidenceSubmitted(_disputeId, _submitter, _evidence, _finished);
        if (_finished) {
            arbitrator.closeEvidencePeriod(_disputeId);
        }
    }
}
