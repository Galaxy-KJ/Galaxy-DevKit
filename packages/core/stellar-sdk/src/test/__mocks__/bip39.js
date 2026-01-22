/**
 * Mock implementation of bip39 for testing
 * This file is automatically used by Jest when bip39 is imported
 */

// Create mock functions that can be reset between tests
const validateMnemonic = jest.fn(() => true);
const mnemonicToSeed = jest.fn(() => Promise.resolve(Buffer.from('mock_seed')));
const generateMnemonic = jest.fn(() => 'mock mnemonic phrase for testing purposes');

module.exports = {
  validateMnemonic,
  mnemonicToSeed,
  generateMnemonic,
};

// Also export as default for ES6 imports
module.exports.default = module.exports;
