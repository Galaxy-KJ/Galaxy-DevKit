/**
 * @jest-environment jsdom
 */

import { setupWebAuthnMock } from './mock-webauthn';
import { SmartWalletClient } from '../services/smart-wallet.client';
import { WalletCreatePanel } from '../panels/wallet-create';
import { WalletSignersPanel } from '../panels/wallet-signers';

describe('UI Panels', () => {
  let client: SmartWalletClient;

  beforeEach(() => {
    setupWebAuthnMock();
    document.body.innerHTML = '<div id="app"></div>';
    client = new SmartWalletClient();
  });

  describe('WalletCreatePanel', () => {
    it('renders and handles registration', async () => {
      new WalletCreatePanel('app', client);
      const regBtn = document.getElementById('wc-register') as HTMLButtonElement;
      const deployBtn = document.getElementById('wc-deploy') as HTMLButtonElement;
      
      expect(deployBtn.disabled).toBe(true);
      
      regBtn.click();
      
      // Wait for async handler
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(document.getElementById('wc-cred-id')?.textContent).not.toBe('-');
      expect(deployBtn.disabled).toBe(false);
      expect(document.getElementById('wc-status')?.textContent).toContain('success');
    });

    it('handles deployment', async () => {
      jest.spyOn(client, 'deployWallet').mockResolvedValue('C-DEPLOYED');
      
      new WalletCreatePanel('app', client);
      
      // Manually set pub key as if registered
      const pubKeyEl = document.getElementById('wc-pub-key')!;
      pubKeyEl.textContent = 'mock-pub';
      
      const deployBtn = document.getElementById('wc-deploy') as HTMLButtonElement;
      deployBtn.disabled = false;
      deployBtn.click();
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(document.getElementById('wc-address')?.textContent).toBe('C-DEPLOYED');
      expect(document.getElementById('wc-status')?.textContent).toContain('success');
    });
  });

  describe('WalletSignersPanel', () => {
    it('renders and handles add signer', async () => {
      jest.spyOn(client, 'addSigner').mockResolvedValue('SIGNED-XDR-ADD');
      
      new WalletSignersPanel('app', client);
      
      (document.getElementById('ws-wallet-address') as HTMLInputElement).value = 'C-WALLET';
      (document.getElementById('ws-auth-id') as HTMLInputElement).value = 'auth-id';
      (document.getElementById('ws-new-cred-id') as HTMLInputElement).value = 'new-id';
      (document.getElementById('ws-new-pub-key') as HTMLInputElement).value = 'new-pub';
      
      document.getElementById('ws-add-signer')?.click();
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect((document.getElementById('ws-signed-xdr') as HTMLTextAreaElement).value).toBe('SIGNED-XDR-ADD');
      expect(document.getElementById('ws-status')?.textContent).toContain('prepared');
    });

    it('handles remove signer', async () => {
      jest.spyOn(client, 'removeSigner').mockResolvedValue('SIGNED-XDR-REMOVE');
      
      new WalletSignersPanel('app', client);
      
      (document.getElementById('ws-wallet-address') as HTMLInputElement).value = 'C-WALLET';
      (document.getElementById('ws-auth-id') as HTMLInputElement).value = 'auth-id';
      (document.getElementById('ws-remove-cred-id') as HTMLInputElement).value = 'remove-id';
      
      document.getElementById('ws-remove-signer')?.click();
      
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect((document.getElementById('ws-signed-xdr') as HTMLTextAreaElement).value).toBe('SIGNED-XDR-REMOVE');
      expect(document.getElementById('ws-status')?.textContent).toContain('prepared');
    });

    it('handles errors during add/remove signer', async () => {
      jest.spyOn(client, 'addSigner').mockRejectedValue(new Error('Add failed'));
      
      new WalletSignersPanel('app', client);
      
      // Missing fields should trigger local error
      document.getElementById('ws-add-signer')?.click();
      expect(document.getElementById('ws-status')?.textContent).toContain('required');

      // Valid fields but rejected by client
      (document.getElementById('ws-wallet-address') as HTMLInputElement).value = 'C-WALLET';
      (document.getElementById('ws-auth-id') as HTMLInputElement).value = 'auth-id';
      (document.getElementById('ws-new-cred-id') as HTMLInputElement).value = 'new-id';
      (document.getElementById('ws-new-pub-key') as HTMLInputElement).value = 'new-pub';
      
      document.getElementById('ws-add-signer')?.click();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(document.getElementById('ws-status')?.textContent).toContain('Add failed');
    });
  });
});
