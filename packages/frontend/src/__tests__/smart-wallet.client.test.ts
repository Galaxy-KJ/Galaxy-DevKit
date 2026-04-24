import { setupWebAuthnMock } from './mock-webauthn';
import { SmartWalletClient } from '../services/smart-wallet.client';
import { Buffer } from 'buffer';

describe('SmartWalletClient', () => {
  let client: SmartWalletClient;

  beforeEach(() => {
    setupWebAuthnMock();
    localStorage.clear();
    client = new SmartWalletClient();
  });

  it('registers a passkey and stores the credential ID', async () => {
    const cred = await client.registerPasskey('test-user');
    
    expect(cred.credentialId).toBeDefined();
    expect(cred.publicKey).toBeDefined();
    
    const stored = JSON.parse(localStorage.getItem('webauthn_credentials') || '[]');
    expect(stored).toContain(cred.credentialId);
  });

  it('deploys a wallet (simulated)', async () => {
    // Mock the underlying service's deploy method
    const service = client.getService();
    (jest.spyOn(service, 'deploy') as any).mockImplementation(async (...args: any[]) => {
      if (args.length > 3 && args[3]?.autoTrustlineUSDC) {
        return { contractAddress: 'C123...', trustlineXdr: 'mock-xdr' };
      }
      return 'C123...';
    });

    await client.registerPasskey();
    const address = await client.deployWallet(Buffer.from(new Uint8Array(65).fill(0).map((_, i) => i === 0 ? 4 : 0)).toString('base64'));
    
    expect(address).toBe('C123...');
  });

  it('addSigner calls the service with correct params', async () => {
    const service = client.getService();
    jest.spyOn(service, 'addSigner').mockResolvedValue('mock-xdr');

    const xdr = await client.addSigner('C1...', 'new-id', 'new-pub', 'auth-id');
    
    expect(xdr).toBe('mock-xdr');
    expect(service.addSigner).toHaveBeenCalledWith({
      walletAddress: 'C1...',
      signerCredentialId: 'new-id',
      signerPublicKey: 'new-pub',
      authCredentialId: 'auth-id',
    });
  });

  it('removeSigner calls the service with correct params', async () => {
    const service = client.getService();
    jest.spyOn(service, 'removeSigner').mockResolvedValue('mock-xdr');

    const xdr = await client.removeSigner('C1...', 'remove-id', 'auth-id');
    
    expect(xdr).toBe('mock-xdr');
    expect(service.removeSigner).toHaveBeenCalledWith({
      walletAddress: 'C1...',
      signerCredentialId: 'remove-id',
      authCredentialId: 'auth-id',
    });
  });
});
