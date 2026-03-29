/**
 * Mock implementation of ed25519-hd-key for testing
 * This file is automatically used by Jest when ed25519-hd-key is imported
 */

// Create mock function for derivePath
// The function takes (path, seedHex) where seedHex is a hex string
const derivePath = jest.fn((path, seedHex) => {
  // Convert hex string to Buffer if needed
  const seedBuffer = Buffer.isBuffer(seedHex) 
    ? seedHex 
    : Buffer.from(seedHex, 'hex');
  
  // Return a mock key object with the expected structure
  // The key should be a Buffer or Uint8Array of 32 bytes
  return {
    key: seedBuffer.slice(0, 32), // Return first 32 bytes as key
    chainCode: seedBuffer.slice(32, 64) || Buffer.alloc(32), // Return next 32 bytes as chain code, or empty buffer
  };
});

module.exports = {
  derivePath,
};

// Also export as default for ES6 imports
module.exports.default = module.exports;
