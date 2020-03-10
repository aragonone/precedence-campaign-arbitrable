pragma solidity ^0.5.8;

import "@aragon/court/contracts/arbitration/IArbitrable.sol";
import "@aragon/court/contracts/arbitration/IArbitrator.sol";
import "@aragon/court/contracts/treasury/ITreasury.sol";
import "@aragon/court/contracts/court/controller/Controller.sol";
import "@aragon/court/contracts/lib/os/SafeERC20.sol";


contract PrecedenceCampaignArbitrable is IArbitrable {
    using SafeERC20 for ERC20;

    string public constant ERROR_SENDER_NOT_ALLOWED = "PCA_SENDER_NOT_ALLOWED";
    string private constant ERROR_INSUFFICIENT_RECOVER_FUNDS = "PCA_INSUFFICIENT_RECOVER_FUNDS";
    string private constant ERROR_RECOVER_TOKEN_FUNDS_FAILED = "PCA_RECOVER_TOKEN_FUNDS_FAILED";

    address public owner;
    IArbitrator public arbitrator;

    event RecoverFunds(ERC20 token, address recipient, uint256 balance);

    modifier only(address _who) {
        require(msg.sender == _who, ERROR_SENDER_NOT_ALLOWED);
        _;
    }

    constructor (address _owner, IArbitrator _arbitrator) public {
        owner = _owner;
        arbitrator = _arbitrator;
    }

    function createDispute(uint256 _possibleRulings, bytes calldata _metadata) external only(owner) returns (uint256) {
        return _createDispute(_possibleRulings, _metadata);
    }

    function submitEvidence(uint256 _disputeId, bytes calldata _evidence, bool _finished) external only(owner) {
        _submitEvidence(_disputeId, msg.sender, _evidence, _finished);
    }

    function submitEvidenceFor(uint256 _disputeId, address _submitter, bytes calldata _evidence, bool _finished) external only(owner) {
        _submitEvidence(_disputeId, _submitter, _evidence, _finished);
    }

    function createAndSubmit(
        uint256 _possibleRulings,
        bytes calldata _metadata,
        address _submitter1,
        address _submitter2,
        bytes calldata _evidence1,
        bytes calldata _evidence2
    )
        external
        only(owner)
        returns (uint256)
    {
        uint256 disputeId = _createDispute(_possibleRulings, _metadata);
        _submitEvidence(disputeId, _submitter1, _evidence1, false);
        _submitEvidence(disputeId, _submitter2, _evidence2, false);

        return disputeId;
    }

    function closeEvidencePeriod(uint256 _disputeId) external only(owner) {
        arbitrator.closeEvidencePeriod(_disputeId);
    }

    function rule(uint256 _disputeId, uint256 _ruling) external only(address(arbitrator)) {
        emit Ruled(IArbitrator(msg.sender), _disputeId, _ruling);
    }

    function setOwner(address _owner) external only(owner) {
        owner = _owner;
    }

    function withdraw(ERC20 _token, address _to, uint256 _amount) external only(owner) {
        ITreasury treasury = ITreasury(Controller(address(arbitrator)).getTreasury());
        treasury.withdraw(_token, _to, _amount);
    }

    /**
    * @notice Transfer all `_token` tokens to `_to`
    * @param _token ERC20 token to be recovered
    * @param _to Address of the recipient that will be receive all the funds of the requested token
    */
    function recoverFunds(ERC20 _token, address _to) external only(owner) {
        uint256 balance = _token.balanceOf(address(this));
        require(balance > 0, ERROR_INSUFFICIENT_RECOVER_FUNDS);
        require(_token.safeTransfer(_to, balance), ERROR_RECOVER_TOKEN_FUNDS_FAILED);
        emit RecoverFunds(_token, _to, balance);
    }

    function _createDispute(uint256 _possibleRulings, bytes memory _metadata) internal returns (uint256) {
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
