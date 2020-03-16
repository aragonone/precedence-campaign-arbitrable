const { assertBn } = require('@aragon/court/test/helpers/asserts/assertBn')
const { bn, bigExp } = require('@aragon/court/test/helpers/lib/numbers')
const { assertEvent } = require('@aragon/court/test/helpers/asserts/assertEvent')
const { assertRevert } = require('@aragon/court/test/helpers/asserts/assertThrow')
const { decodeEventsOfType } = require('@aragon/court/test/helpers/lib/decodeEvent')

const ERC20 = artifacts.require('ERC20Mock')
const CourtTreasury = artifacts.require('TreasuryMock')
const ArbitratorMock = artifacts.require('ArbitratorMock')
const PrecedenceCampaignArbitrable = artifacts.require('PrecedenceCampaignArbitrable')

const getRawEventAttribute = (receipt, contract, eventName, attribute) => {
  const logs = decodeEventsOfType(receipt, contract.abi, eventName)
  return logs[0].args[attribute]
}

const assertRawEvent = (receipt, contract, eventName, args = {}, index = 0) => {
  const logs = decodeEventsOfType(receipt, contract.abi, eventName)
  assertEvent({ logs }, eventName, args, index)
}

contract('Precedence Campaign Arbitrable', ([_, owner, other, submitter1, submitter2]) => {
  const ERROR_SENDER_NOT_ALLOWED = 'PCA_SENDER_NOT_ALLOWED'
  const ERROR_RECOVER_FUNDS_FAILED = 'PCA_RECOVER_FUNDS_FAILED'

  const FEE_AMOUNT = bigExp(1, 16)
  const SUBSCRIPTION_AMOUNT = bigExp(2, 16)
  const POSSIBLE_RULINGS = 2
  const METADATA = '0x1234'

  let arbitrator, arbitrable, disputeId, token

  beforeEach('Deploy contracts', async () => {
    token = await ERC20.new('Test Token', 'TT', 18)
    arbitrator = await ArbitratorMock.new(token.address, FEE_AMOUNT, SUBSCRIPTION_AMOUNT)
    arbitrable = await PrecedenceCampaignArbitrable.new(owner, arbitrator.address)
  })

  beforeEach('fund arbitrable', async () => {
    await token.mint(arbitrable.address, FEE_AMOUNT.mul(bn(1000)))
  })

  context('Create dispute', () => {
    it('fails to create dispute if not owner', async () => {
      await assertRevert(arbitrable.createDispute(POSSIBLE_RULINGS, METADATA, { from: other }), ERROR_SENDER_NOT_ALLOWED)
    })

    it('event is emitted', async () => {
      const receipt = await arbitrable.createDispute(POSSIBLE_RULINGS, METADATA, { from: owner })
      assertRawEvent(receipt, ArbitratorMock, 'NewDispute', { possibleRulings: POSSIBLE_RULINGS, metadata: METADATA })
    })
  })

  const checkEvidenceEvent = (receipt, index, submitter, evidence, finished) => {
    assertEvent(receipt, 'EvidenceSubmitted', { disputeId, submitter, evidence, finished }, index)
  }

  const createEvidence = (submitter, method) => {
    context('creates evidence', () => {
      const EVIDENCE = '0x5678'

      beforeEach('Create dispute', async () => {
        const receipt = await arbitrable.createDispute(POSSIBLE_RULINGS, METADATA, { from: owner })
        disputeId = getRawEventAttribute(receipt, ArbitratorMock, 'NewDispute', 'disputeId')
      })

      it('fails to submit if not owner', async () => {
        await assertRevert(method(arbitrable)(disputeId, EVIDENCE, true, { from: other }), ERROR_SENDER_NOT_ALLOWED)
      })

      const submitEvidence = (finished) => {
        it('event is emitted', async () => {
          const receipt = await method(arbitrable)(disputeId, EVIDENCE, finished, { from: owner })
          checkEvidenceEvent(receipt, 0, submitter, EVIDENCE, finished)
        })
      }

      context('finished evidence period', () => {
        submitEvidence(true)
      })

      context('doesn\'t finish evidence period', () => {
        submitEvidence(false)
      })
    })
  }

  context('Submit', () => {
    createEvidence(owner, arbitrable => arbitrable.submitEvidence)
  })

  context('Forward', () => {
    createEvidence(submitter1, arbitrable => async (disputeId, evidence, finished, params) => arbitrable.submitEvidenceFor(disputeId, submitter1, evidence, finished, params))
  })

  context('Create and submit', () => {
    const EVIDENCE_1 = '0x2345'
    const EVIDENCE_2 = '0x6789'

    it('fails to create dispute if not owner', async () => {
      await assertRevert(arbitrable.createAndSubmit(POSSIBLE_RULINGS, METADATA, submitter1, submitter2, EVIDENCE_1, EVIDENCE_2, { from: other }), ERROR_SENDER_NOT_ALLOWED)
    })

    it('event is emitted', async () => {
      const receipt = await arbitrable.createAndSubmit(POSSIBLE_RULINGS, METADATA, submitter1, submitter2, EVIDENCE_1, EVIDENCE_2, { from: owner })

      assertRawEvent(receipt, ArbitratorMock, 'NewDispute', { possibleRulings: POSSIBLE_RULINGS, metadata: METADATA })
      checkEvidenceEvent(receipt, 0, submitter1, EVIDENCE_1, false)
      checkEvidenceEvent(receipt, 1, submitter2, EVIDENCE_2, false)
    })
  })

  context('Close evidence period', () => {
    const EVIDENCE_1 = '0x2345'
    const EVIDENCE_2 = '0x6789'

    beforeEach('Create dispute and submit evidence', async () => {
      const receipt = await arbitrable.createAndSubmit(POSSIBLE_RULINGS, METADATA, submitter1, submitter2, EVIDENCE_1, EVIDENCE_2, { from: owner })
      disputeId = getRawEventAttribute(receipt, ArbitratorMock, 'NewDispute', 'disputeId')
    })

    it('fails to close evidence period if not owner', async () => {
      await assertRevert(arbitrable.closeEvidencePeriod(disputeId, { from: other }), ERROR_SENDER_NOT_ALLOWED)
    })

    it('closes evidence period', async () => {
      const receipt = await arbitrable.closeEvidencePeriod(disputeId, { from: owner })
      assertRawEvent(receipt, ArbitratorMock, 'EvidencePeriodClosed', { disputeId })
    })
  })

  context('Rule', () => {
    const RULING = 1

    beforeEach('Create dispute and set ruling', async () => {
      const receipt = await arbitrable.createDispute(POSSIBLE_RULINGS, METADATA, { from: owner })
      disputeId = getRawEventAttribute(receipt, ArbitratorMock, 'NewDispute', 'disputeId')

      // set ruling
      await arbitrator.setRuling(disputeId, RULING)
    })

    it('rules', async () => {
      const receipt = await arbitrator.executeRuling(disputeId)
      assertRawEvent(receipt, PrecedenceCampaignArbitrable, 'Ruled', { arbitrator: arbitrator.address, disputeId, ruling: RULING })
    })
  })

  context('Set owner', () => {
    it('fails to set owner if not owner', async () => {
      await assertRevert(arbitrable.setOwner(other, { from: other }), ERROR_SENDER_NOT_ALLOWED)
    })

    it('changes owner', async () => {
      await arbitrable.setOwner(other, { from: owner })
      assert.equal(await arbitrable.owner(), other, `owner doesn't match`)
    })
  })

  context('Interface', () => {
    it('supports arbitrable interface', async () => {
      const supports = await arbitrable.supportsInterface('0x88f3ee69')
      assert.isTrue(supports, `doesn't support interface`)
    })
  })

  describe('withdraw', () => {
    context('when the sender is the owner', () => {
      it('withdraws tokens from the treasury', async () => {
        const receipt = await arbitrable.withdraw(token.address, other, bn(10), { from: owner })

        const logs = decodeEventsOfType(receipt, CourtTreasury.abi, 'Withdraw')
        assertEvent({ logs }, 'Withdraw', { token: token.address, to: other, amount: bn(10) })
      })
    })

    context('when the sender is not the owner', () => {
      it('reverts', async () => {
        await assertRevert(arbitrable.withdraw(token.address, other, bn(10), { from: other }), ERROR_SENDER_NOT_ALLOWED)
      })
    })
  })

  describe('recover funds', () => {
    const amount = bigExp(10000000, 18)

    context('when the sender is the owner', () => {
      context('when the arbitrable has funds', () => {
        beforeEach('fund Arbitrable with tokens', async () => {
          await token.mint(arbitrable.address, amount)
        })

        it('transfers the tokens to the recipient address', async () => {
          const previousBalance = await token.balanceOf(other)

          await arbitrable.recoverFunds(token.address, other, amount, { from: owner })

          const currentBalance = await token.balanceOf(other)
          assertBn(currentBalance, previousBalance.add(amount), 'current balance does not match')
        })
      })

      context('when the arbitrable does not have funds', () => {
        it('reverts', async () => {
          await assertRevert(arbitrable.recoverFunds(token.address, other, amount, { from: owner }), ERROR_RECOVER_FUNDS_FAILED)
        })
      })
    })

    context('when the sender is not the owner', () => {
      it('reverts', async () => {
        await assertRevert(arbitrable.recoverFunds(token.address, other, amount, { from: other }), ERROR_SENDER_NOT_ALLOWED)
      })
    })
  })
})
