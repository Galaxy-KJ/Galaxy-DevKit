import { SmartWalletClient } from '../services/smart-wallet.client';
import { assertWriteOperation } from '../actions';

export class WalletCreatePanel {
  private container: HTMLElement;
  private client: SmartWalletClient;
  private credentialIdDisplay: HTMLElement | null = null;
  private publicKeyDisplay: HTMLElement | null = null;
  private walletAddressDisplay: HTMLElement | null = null;
  private statusDisplay: HTMLElement | null = null;

  constructor(containerId: string, client: SmartWalletClient) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Container #${containerId} not found`);
    this.container = el;
    this.client = client;
    this.render();
  }

  private render() {
    this.container.innerHTML = `
      <div class="panel wallet-create">
        <h3>Create Smart Wallet</h3>
        <div class="form-group">
          <label>Username</label>
          <input type="text" id="wc-username" value="Galaxy User" />
        </div>
        <div class="actions">
          <button id="wc-register">1. Register Passkey</button>
          <button id="wc-deploy" disabled>2. Deploy Wallet</button>
        </div>
        <div class="results">
          <div class="result-item">
            <strong>Credential ID:</strong>
            <code id="wc-cred-id">-</code>
          </div>
          <div class="result-item">
            <strong>Public Key (Base64):</strong>
            <code id="wc-pub-key">-</code>
          </div>
          <div class="result-item">
            <strong>Wallet Address:</strong>
            <code id="wc-address">-</code>
          </div>
        </div>
        <div id="wc-status" class="status"></div>
      </div>
    `;

    this.credentialIdDisplay = document.getElementById('wc-cred-id');
    this.publicKeyDisplay = document.getElementById('wc-pub-key');
    this.walletAddressDisplay = document.getElementById('wc-address');
    this.statusDisplay = document.getElementById('wc-status');

    document.getElementById('wc-register')?.addEventListener('click', () => this.handleRegister());
    document.getElementById('wc-deploy')?.addEventListener('click', () => this.handleDeploy());
  }

  private async handleRegister() {
    try {
      this.updateStatus('Registering passkey...', 'info');
      const username = (document.getElementById('wc-username') as HTMLInputElement).value;
      const cred = await this.client.registerPasskey(username);

      if (this.credentialIdDisplay) this.credentialIdDisplay.textContent = cred.credentialId;
      if (this.publicKeyDisplay) this.publicKeyDisplay.textContent = cred.publicKey;

      (document.getElementById('wc-deploy') as HTMLButtonElement).disabled = false;
      this.updateStatus('Passkey registered successfully!', 'success');
    } catch (err: any) {
      this.updateStatus(`Registration failed: ${err.message}`, 'error');
    }
  }

  private async handleDeploy() {
    try {
      assertWriteOperation();
      this.updateStatus('Deploying smart wallet (simulating)...', 'info');
      const publicKey = this.publicKeyDisplay?.textContent;
      if (!publicKey || publicKey === '-') throw new Error('No public key found');

      const address = await this.client.deployWallet(publicKey);

      if (this.walletAddressDisplay) this.walletAddressDisplay.textContent = address;
      this.updateStatus('Wallet deployed successfully!', 'success');
    } catch (err: any) {
      this.updateStatus(`Deployment failed: ${err.message}`, 'error');
    }
  }

  private updateStatus(msg: string, type: 'info' | 'success' | 'error') {
    if (this.statusDisplay) {
      this.statusDisplay.textContent = msg;
      this.statusDisplay.className = `status status-${type}`;
    }
  }
}
