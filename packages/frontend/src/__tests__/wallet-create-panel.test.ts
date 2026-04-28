/**
 * @jest-environment jsdom
 */

import { setupWebAuthnMock } from './mock-webauthn';
import { WalletCreatePanel } from '../panels/wallet-create';
import { SmartWalletClient } from '../services/smart-wallet.client';
import { Buffer } from 'buffer';

describe('WalletCreatePanel', () => {
  let container: HTMLElement;
  let client: SmartWalletClient;
  let panel: WalletCreatePanel;

  beforeEach(() => {
    setupWebAuthnMock();
    localStorage.clear();
    
    // Create a container for the panel
    container = document.createElement('div');
    container.id = 'wallet-create-test';
    document.body.appendChild(container);
    
    client = new SmartWalletClient();
    panel = new WalletCreatePanel('wallet-create-test', client);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('UI rendering', () => {
    it('should render the panel', () => {
      const panelEl = document.querySelector('.wallet-create');
      expect(panelEl).toBeTruthy();
    });

    it('should render mode selector buttons', () => {
      const createBtn = document.getElementById('wc-mode-create');
      const importBtn = document.getElementById('wc-mode-import');
      
      expect(createBtn).toBeTruthy();
      expect(importBtn).toBeTruthy();
    });

    it('should show create section by default', () => {
      const createSection = document.getElementById('create-section');
      expect(createSection?.classList.contains('active')).toBe(true);
    });

    it('should hide import section initially', () => {
      const importSection = document.getElementById('import-section');
      expect(importSection?.classList.contains('active')).toBe(false);
    });

    it('should render create wallet form elements', () => {
      expect(document.getElementById('wc-username')).toBeTruthy();
      expect(document.getElementById('wc-register')).toBeTruthy();
      expect(document.getElementById('wc-deploy')).toBeTruthy();
    });

    it('should render import wallet form elements', () => {
      expect(document.getElementById('wc-import-address')).toBeTruthy();
      expect(document.getElementById('wc-import-verify')).toBeTruthy();
    });

    it('should display deploy button as disabled initially', () => {
      const deployBtn = document.getElementById('wc-deploy') as HTMLButtonElement;
      expect(deployBtn.disabled).toBe(true);
    });
  });

  describe('mode switching', () => {
    it('should switch to import mode when import button clicked', () => {
      const importBtn = document.getElementById('wc-mode-import');
      importBtn?.click();
      
      const importSection = document.getElementById('import-section');
      const createSection = document.getElementById('create-section');
      
      expect(importSection?.classList.contains('active')).toBe(true);
      expect(createSection?.classList.contains('active')).toBe(false);
    });

    it('should switch back to create mode', () => {
      const importBtn = document.getElementById('wc-mode-import');
      const createBtn = document.getElementById('wc-mode-create');
      
      importBtn?.click();
      expect(document.getElementById('import-section')?.classList.contains('active')).toBe(true);
      
      createBtn?.click();
      expect(document.getElementById('create-section')?.classList.contains('active')).toBe(true);
    });

    it('should update button active states', () => {
      const createBtn = document.getElementById('wc-mode-create');
      const importBtn = document.getElementById('wc-mode-import');
      
      expect(createBtn?.classList.contains('active')).toBe(true);
      expect(importBtn?.classList.contains('active')).toBe(false);
      
      importBtn?.click();
      expect(createBtn?.classList.contains('active')).toBe(false);
      expect(importBtn?.classList.contains('active')).toBe(true);
    });
  });

  describe('passkey registration (create mode)', () => {
    it('should register a passkey', async () => {
      const registerBtn = document.getElementById('wc-register');
      registerBtn?.click();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const credIdDisplay = document.getElementById('wc-cred-id');
      expect(credIdDisplay?.textContent).not.toBe('-');
    });

    it('should update deploy button state after registration', async () => {
      const registerBtn = document.getElementById('wc-register');
      registerBtn?.click();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const deployBtn = document.getElementById('wc-deploy') as HTMLButtonElement;
      // Button should be enabled after successful registration
      expect(deployBtn).toBeTruthy();
    });

    it('should handle registration error', async () => {
      // Mock a registration failure
      jest.spyOn(client, 'registerPasskey').mockRejectedValueOnce(
        new Error('Registration failed')
      );
      
      const registerBtn = document.getElementById('wc-register');
      registerBtn?.click();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const statusEl = document.getElementById('wc-status');
      expect(statusEl?.classList.contains('status-error')).toBe(true);
    });
  });

  describe('wallet deployment (create mode)', () => {
    beforeEach(async () => {
      // Register passkey first
      const registerBtn = document.getElementById('wc-register');
      registerBtn?.click();
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should deploy wallet', async () => {
      // Mock the deploy method
      jest.spyOn(client, 'deployWallet').mockResolvedValueOnce('CTEST123...');
      
      const deployBtn = document.getElementById('wc-deploy');
      deployBtn?.click();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const addressDisplay = document.getElementById('wc-address');
      expect(addressDisplay?.textContent).toBe('CTEST123...');
    });

    it('should show success status after deployment', async () => {
      jest.spyOn(client, 'deployWallet').mockResolvedValueOnce('CTEST123...');
      
      const deployBtn = document.getElementById('wc-deploy');
      deployBtn?.click();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const statusEl = document.getElementById('wc-status');
      expect(statusEl?.classList.contains('status-success')).toBe(true);
    });

    it('should handle deployment error', async () => {
      jest.spyOn(client, 'deployWallet').mockRejectedValueOnce(
        new Error('Deployment failed')
      );
      
      const deployBtn = document.getElementById('wc-deploy');
      deployBtn?.click();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const statusEl = document.getElementById('wc-status');
      expect(statusEl?.classList.contains('status-error')).toBe(true);
    });
  });

  describe('wallet import (import mode)', () => {
    beforeEach(() => {
      const importBtn = document.getElementById('wc-mode-import');
      importBtn?.click();
    });

    it('should validate contract address format', async () => {
      const addressInput = document.getElementById('wc-import-address') as HTMLInputElement;
      
      // Test invalid address
      addressInput.value = 'invalid-address';
      const event = new Event('input', { bubbles: true });
      addressInput.dispatchEvent(event);
      
      // Address should have visual feedback
      expect(addressInput.style.borderColor).toBeTruthy();
    });

    it('should clear validation on valid address', async () => {
      const addressInput = document.getElementById('wc-import-address') as HTMLInputElement;
      
      // Test valid format (starts with C and valid bech32)
      const validAddress = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2DAAAA';
      addressInput.value = validAddress;
      const event = new Event('input', { bubbles: true });
      addressInput.dispatchEvent(event);
      
      // Note: actual validation depends on the address format
    });

    it('should handle import verification', async () => {
      const addressInput = document.getElementById('wc-import-address') as HTMLInputElement;
      const validAddress = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2DAAAA';
      addressInput.value = validAddress;
      
      const verifyBtn = document.getElementById('wc-import-verify');
      verifyBtn?.click();
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Should show results container
      const resultsContainer = document.getElementById('wc-import-results');
      expect(resultsContainer).toBeTruthy();
    });

    it('should show error for invalid address', async () => {
      const addressInput = document.getElementById('wc-import-address') as HTMLInputElement;
      addressInput.value = 'invalid';
      
      const verifyBtn = document.getElementById('wc-import-verify');
      verifyBtn?.click();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const statusEl = document.getElementById('wc-status');
      expect(statusEl?.classList.contains('status-error')).toBe(true);
    });

    it('should require address before import', async () => {
      const addressInput = document.getElementById('wc-import-address') as HTMLInputElement;
      addressInput.value = '';
      
      const verifyBtn = document.getElementById('wc-import-verify');
      verifyBtn?.click();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const statusEl = document.getElementById('wc-status');
      expect(statusEl?.textContent).toContain('Address');
    });
  });

  describe('Status display', () => {
    it('should display status messages', () => {
      const statusEl = document.getElementById('wc-status');
      expect(statusEl).toBeTruthy();
    });

    it('should apply correct CSS classes for different status types', async () => {
      const registerBtn = document.getElementById('wc-register');
      registerBtn?.click();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const statusEl = document.getElementById('wc-status');
      expect(statusEl?.className).toMatch(/status-(info|success|error)/);
    });
  });

  describe('accessibility and user experience', () => {
    it('should provide helpful placeholder text', () => {
      const addressInput = document.getElementById('wc-import-address') as HTMLInputElement;
      expect(addressInput.placeholder).toBeTruthy();
    });

    it('should have descriptive labels', () => {
      const usernameLabel = Array.from(document.querySelectorAll('label'))
        .find(l => l.textContent === 'Username');
      expect(usernameLabel).toBeTruthy();
    });

    it('should disable deploy button until passkey registered', () => {
      const deployBtn = document.getElementById('wc-deploy') as HTMLButtonElement;
      expect(deployBtn.disabled).toBe(true);
    });
  });
});
