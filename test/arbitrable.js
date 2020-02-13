const { assertRevert } = require('@aragon/court/test/helpers/asserts/assertThrow')
const { assertBn } = require('@aragon/court/test/helpers/asserts/assertBn')
const { getEventArgument } = require('@aragon/test-helpers/events')
const { bn, bigExp } = require('@aragon/court/test/helpers/lib/numbers')

const ERC20 = artifacts.require('ERC20Mock')
const ArbitratorMock = artifacts.require('ArbitratorMock')
const PrecedenceCampaignArbitrable = artifacts.require('PrecedenceCampaignArbitrable')

const getRawLog = (receipt, contract, eventName) => {
  const eventAbi = contract.abi.filter(o => o.type === 'event' && o.name === eventName)[0]
  const rawLog = receipt.receipt.rawLogs.filter(l => l.topics[0] === eventAbi.signature)[0]
  return web3.eth.abi.decodeLog(
    eventAbi.inputs,
    rawLog.data,
    rawLog.topics.slice(1)
  )
}

contract('Precedence Campaign Arbitrable', ([_, owner, other, submitter1, submitter2]) => {
  const ERROR_SENDER_NOT_ALLOWED = 'PCA_SENDER_NOT_ALLOWED'

  const FEE_AMOUNT = bigExp(1, 16)
  const SUBSCRIPTION_AMOUNT = bigExp(2, 16)
  const POSSIBLE_RULINGS = 2
  const METADATA = '0x1234'

  let arbitrator, arbitrable
  let disputeId

  beforeEach('Deploy contracts', async () => {
    const token = await ERC20.new('Test Token', 'TT', 18)
    arbitrator = await ArbitratorMock.new(token.address, FEE_AMOUNT, SUBSCRIPTION_AMOUNT)
    arbitrable = await PrecedenceCampaignArbitrable.new(owner, arbitrator.address)

    // make sure Arbitrable has funds
    await token.mint(arbitrable.address, FEE_AMOUNT.mul(bn(1000)))
  })

  context('Create dispute', () => {
    it('fails to create dispute if not owner', async () => {
      await assertRevert(arbitrable.createDispute(POSSIBLE_RULINGS, METADATA, { from: other }), ERROR_SENDER_NOT_ALLOWED)
    })

    it('event is emitted', async () => {
      const receipt = await arbitrable.createDispute(POSSIBLE_RULINGS, METADATA, { from: owner })
      const rawLog = getRawLog(receipt, ArbitratorMock, 'NewDispute')
      assert.equal(rawLog.possibleRulings, POSSIBLE_RULINGS, `possible rulings don't match`)
      assert.equal(rawLog.metadata, METADATA, `Metadata doesn't match`)
    })
  })

  const checkEvidenceEvent = (receipt, index, submitter, evidence, finished) => {
    const eventDisputeId = getEventArgument(receipt, 'EvidenceSubmitted', 'disputeId', index).toNumber()
    const eventSubmitter = getEventArgument(receipt, 'EvidenceSubmitted', 'submitter', index)
    const eventEvidence = getEventArgument(receipt, 'EvidenceSubmitted', 'evidence', index)
    const eventFinished = getEventArgument(receipt, 'EvidenceSubmitted', 'finished', index)
    assertBn(eventDisputeId, disputeId, `dispute id doesn't match`)
    assert.equal(eventSubmitter, submitter, `submitter doesn't match`)
    assert.equal(eventEvidence, evidence, `evidence doesn't match`)
    assert.equal(eventFinished, finished, `finished doesn't match`)
  }

  const createEvidence = (submitter, method) => {
    context('creates evidence', () => {
      const EVIDENCE = '0x5678'

      beforeEach('Create dispute', async () => {
        const receipt = await arbitrable.createDispute(POSSIBLE_RULINGS, METADATA, { from: owner })
        disputeId = getRawLog(receipt, ArbitratorMock, 'NewDispute').disputeId
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
      const rawLog = getRawLog(receipt, ArbitratorMock, 'NewDispute')
      assert.equal(rawLog.possibleRulings, POSSIBLE_RULINGS, `possible rulings don't match`)
      assert.equal(rawLog.metadata, METADATA, `Metadata doesn't match`)

      checkEvidenceEvent(receipt, 0, submitter1, EVIDENCE_1, false)
      checkEvidenceEvent(receipt, 1, submitter2, EVIDENCE_2, false)
    })
  })

  context('Close evidence period', () => {
    const EVIDENCE_1 = '0x2345'
    const EVIDENCE_2 = '0x6789'

    beforeEach('Create dispute and submit evidence', async () => {
      const receipt = await arbitrable.createAndSubmit(POSSIBLE_RULINGS, METADATA, submitter1, submitter2, EVIDENCE_1, EVIDENCE_2, { from: owner })
      disputeId = getRawLog(receipt, ArbitratorMock, 'NewDispute').disputeId
    })

    it('fails to close evidence period if not owner', async () => {
      await assertRevert(arbitrable.closeEvidencePeriod(disputeId, { from: other }), ERROR_SENDER_NOT_ALLOWED)
    })

    it('closes evidence period', async () => {
      const receipt = await arbitrable.closeEvidencePeriod(disputeId, { from: owner })
      const rawLog = getRawLog(receipt, ArbitratorMock, 'EvidencePeriodClosed')
      assertBn(rawLog.disputeId, disputeId, `dispute id doesn't match`)
    })
  })

  context('Rule', () => {
    const RULING = 1

    beforeEach('Create dispute and set ruling', async () => {
      const receipt = await arbitrable.createDispute(POSSIBLE_RULINGS, METADATA, { from: owner })
      disputeId = getRawLog(receipt, ArbitratorMock, 'NewDispute').disputeId

      // set ruling
      await arbitrator.setRuling(disputeId, RULING)
    })

    it('rules', async () => {
      const receipt = await arbitrator.executeRuling(disputeId)
      const rawLog = getRawLog(receipt, PrecedenceCampaignArbitrable, 'Ruled')
      assert.equal(rawLog.arbitrator, arbitrator.address, `arbitrator doesn't match`)
      assertBn(rawLog.disputeId, disputeId, `dispute id doesn't match`)
      assert.equal(rawLog.ruling, RULING, `ruling doesn't match`)
    })
  })

  context('Set owner', () => {
    it('fails to set owner  if not owner', async () => {
      await assertRevert(arbitrable.setOwner(other, { from: other }), ERROR_SENDER_NOT_ALLOWED)
    })

    it('changes owner', async () => {
      const receipt = await arbitrable.setOwner(other, { from: owner })
      assert.equal(await arbitrable.owner(), other, `owner doesn't match`)
    })
  })

  context('Interface', () => {
    it('supports arbitrable interface', async () => {
      const supports = await arbitrable.supportsInterface('0x88f3ee69')
      assert.isTrue(supports, `doesn't support interface`)
    })
  })
})
