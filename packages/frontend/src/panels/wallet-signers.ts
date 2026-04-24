import { SmartWalletClient } from '../services/smart-wallet.client';

export class WalletSignersPanel {
  private container: HTMLElement;
  private client: SmartWalletClient;
  private statusDisplay: HTMLElement | null = null;
  private signedXdrDisplay: HTMLElement | null = null;

  constructor(containerId: string, client: SmartWalletClient) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Container #${containerId} not found`);
    this.container = el;
    this.client = client;
    this.render();
  }

  private render() {
    this.container.innerHTML = `
      <div class="panel wallet-signers">
        <h3>Signer Management</h3>
        
        <div class="form-section">
          <h4>Add New Signer</h4>
          <div class="form-group">
            <label>Wallet Address (C...)</label>
            <input type="text" id="ws-wallet-address" placeholder="C..." />
          </div>
          <div class="form-group">
            <label>Authorized Credential ID (Admin)</label>
            <input type="text" id="ws-auth-id" placeholder="Base64url" />
          </div>
          <hr />
          <div class="form-group">
            <label>New Signer Credential ID</label>
            <input type="text" id="ws-new-cred-id" placeholder="Base64url" />
          </div>
          <div class="form-group">
            <label>New Signer Public Key (Base64)</label>
            <input type="text" id="ws-new-pub-key" placeholder="Base64" />
          </div>
          <button id="ws-add-signer">Add Signer</button>
        </div>

        <div class="form-section">
          <h4>Remove Signer</h4>
          <div class="form-group">
            <label>Signer Credential ID to Remove</label>
            <input type="text" id="ws-remove-cred-id" placeholder="Base64url" />
          </div>
          <button id="ws-remove-signer">Remove Signer</button>
        </div>

        <div class="results">
          <div class="result-item">
            <strong>Signed XDR (Base64):</strong>
            <textarea id="ws-signed-xdr" rows="4" readonly></textarea>
          </div>
        </div>
        <div id="ws-status" class="status"></div>
      </div>
    `;

    this.statusDisplay = document.getElementById('ws-status');
    this.signedXdrDisplay = document.getElementById('ws-signed-xdr');

    document.getElementById('ws-add-signer')?.addEventListener('click', () => this.handleAddSigner());
    document.getElementById('ws-remove-signer')?.addEventListener('click', () => this.handleRemoveSigner());
  }

  private async handleAddSigner() {
    try {
      this.updateStatus('Preparing add_signer transaction...', 'info');
      const walletAddress = (document.getElementById('ws-wallet-address') as HTMLInputElement).value.trim();
      const authId = (document.getElementById('ws-auth-id') as HTMLInputElement).value.trim();
      const newCredId = (document.getElementById('ws-new-cred-id') as HTMLInputElement).value.trim();
      const newPubKey = (document.getElementById('ws-new-pub-key') as HTMLInputElement).value.trim();

      if (!walletAddress || !authId || !newCredId || !newPubKey) {
        throw new Error('All fields are required');
      }

      const xdr = await this.client.addSigner(walletAddress, newCredId, newPubKey, authId);
      
      if (this.signedXdrDisplay) (this.signedXdrDisplay as HTMLTextAreaElement).value = xdr;
      this.updateStatus('Add signer transaction prepared!', 'success');
    } catch (err: any) {
      this.updateStatus(`Error: ${err.message}`, 'error');
    }
  }

  private async handleRemoveSigner() {
    try {
      this.updateStatus('Preparing remove_signer transaction...', 'info');
      const walletAddress = (document.getElementById('ws-wallet-address') as HTMLInputElement).value.trim();
      const authId = (document.getElementById('ws-auth-id') as HTMLInputElement).value.trim();
      const removeCredId = (document.getElementById('ws-remove-cred-id') as HTMLInputElement).value.trim();

      if (!walletAddress || !authId || !removeCredId) {
        throw new Error('Wallet Address, Auth ID, and Remove Credential ID are required');
      }

      const xdr = await this.client.removeSigner(walletAddress, removeCredId, authId);
      
      if (this.signedXdrDisplay) (this.signedXdrDisplay as HTMLTextAreaElement).value = xdr;
      this.updateStatus('Remove signer transaction prepared!', 'success');
    } catch (err: any) {
      this.updateStatus(`Error: ${err.message}`, 'error');
    }
  }

  private updateStatus(msg: string, type: 'info' | 'success' | 'error') {
    if (this.statusDisplay) {
      this.statusDisplay.textContent = msg;
      this.statusDisplay.className = `status status-${type}`;
    }
  }
}
