const TruffleConfig = require('@aragon/truffle-config-v5/truffle-config')

TruffleConfig.plugins = ["solidity-coverage"]

TruffleConfig.compilers.solc.version = '0.5.8'

module.exports = TruffleConfig
