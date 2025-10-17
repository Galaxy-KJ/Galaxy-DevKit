// src/index.js
// Entry exports for ESM and CJS-friendly bundling
'use strict';


const GalaxyClient = require('./client/galaxy-client');
const WalletService = require('./services/wallet-service');
const ContractService = require('./services/contract-service');
const AutomationService = require('./services/automation-service');
const MarketService = require('./services/market-service');


module.exports = {
GalaxyClient,
WalletService,
ContractService,
AutomationService,
MarketService,
};


// also provide named exports for ESM consumers (when bundlers pick module entry)
exports.default = module.exports;