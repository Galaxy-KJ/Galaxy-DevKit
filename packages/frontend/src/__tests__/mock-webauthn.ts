import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

export function setupWebAuthnMock() {
  const mockCredential = {
    id: 'mock-id',
    rawId: Buffer.from('mock-id'),
    type: 'public-key',
    response: {
      clientDataJSON: Buffer.from('{}'),
      attestationObject: Buffer.from('{}'),
      authenticatorData: Buffer.from('{}'),
      signature: Buffer.from('mock-sig'),
      getPublicKey: () => {
        // 65 bytes uncompressed P-256 key starting with 0x04
        const key = new Uint8Array(65);
        key[0] = 0x04;
        return key.buffer;
      },
    },
  };

  Object.defineProperty(global.navigator, 'credentials', {
    value: {
      create: jest.fn().mockResolvedValue(mockCredential),
      get: jest.fn().mockResolvedValue(mockCredential),
    },
    configurable: true,
  });

  Object.defineProperty(global, 'crypto', {
    value: {
      getRandomValues: (arr: Uint8Array) => arr.fill(0),
      subtle: {
        digest: jest.fn().mockResolvedValue(new Uint8Array(32).buffer),
      },
    },
    configurable: true,
  });
}
