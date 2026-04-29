import { SmartWalletClient } from '../services/smart-wallet.client';
import { assertWriteOperation } from '../actions';
import { WalletConnectorService, ImportedWalletInfo } from '../services/wallet-connector';

export class WalletCreatePanel {
  private container: HTMLElement;
  private client: SmartWalletClient;
  private connectorService: WalletConnectorService;
  private currentMode: 'create' | 'import' = 'create';
  private credentialIdDisplay: HTMLElement | null = null;
  private publicKeyDisplay: HTMLElement | null = null;
  private walletAddressDisplay: HTMLElement | null = null;
  private statusDisplay: HTMLElement | null = null;

  constructor(containerId: string, client: SmartWalletClient) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Container #${containerId} not found`);
    this.container = el;
    this.client = client;
    this.connectorService = new WalletConnectorService(
      client,
      client.getRpcUrl(),
      client.getNetwork()
    );
    this.render();
  }

  private render() {
    this.container.innerHTML = `
      <div class="panel wallet-create">
        <h3>Wallet Management</h3>
        
        <!-- Mode Selector -->
        <div class="mode-selector">
          <button id="wc-mode-create" class="mode-btn active">Create New Wallet</button>
          <button id="wc-mode-import" class="mode-btn">Import Existing Wallet</button>
        </div>

        <!-- Create Wallet Section -->
        <div id="create-section" class="mode-section active">
          <h4>Create a New Smart Wallet</h4>
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
        </div>

        <!-- Import Wallet Section -->
        <div id="import-section" class="mode-section">
          <h4>Import Existing Smart Wallet</h4>
          <div class="form-group">
            <label>Wallet Contract Address (C...)</label>
            <input
              type="text"
              id="wc-import-address"
              placeholder="Enter contract address (e.g., CABC123...)"
            />
          </div>
          <div class="form-help">
            <p>Paste the contract address of your previously deployed smart wallet.</p>
          </div>
          <div class="actions">
            <button id="wc-import-verify">Verify & Import Wallet</button>
          </div>
          <div class="results">
            <div class="result-item" id="wc-import-results" style="display: none;">
              <div id="wc-import-status-info"></div>
              <div id="wc-import-signers" style="margin-top: 10px;"></div>
            </div>
          </div>
        </div>

        <!-- Shared status display -->
        <div id="wc-status" class="status"></div>
      </div>
    `;

    this.credentialIdDisplay = document.getElementById('wc-cred-id');
    this.publicKeyDisplay = document.getElementById('wc-pub-key');
    this.walletAddressDisplay = document.getElementById('wc-address');
    this.statusDisplay = document.getElementById('wc-status');

    // Mode switching
    document.getElementById('wc-mode-create')?.addEventListener('click', () => this.switchMode('create'));
    document.getElementById('wc-mode-import')?.addEventListener('click', () => this.switchMode('import'));

    // Create mode handlers
    document.getElementById('wc-register')?.addEventListener('click', () => this.handleRegister());
    document.getElementById('wc-deploy')?.addEventListener('click', () => this.handleDeploy());

    // Import mode handlers
    document.getElementById('wc-import-verify')?.addEventListener('click', () => this.handleImportVerify());

    // Real-time validation for import address
    document.getElementById('wc-import-address')?.addEventListener('input', (e) => {
      this.validateImportAddressFormat(e);
    });
  }

  private switchMode(mode: 'create' | 'import') {
    this.currentMode = mode;
    
    // Update mode buttons
    const createBtn = document.getElementById('wc-mode-create');
    const importBtn = document.getElementById('wc-mode-import');
    if (createBtn) createBtn.classList.toggle('active', mode === 'create');
    if (importBtn) importBtn.classList.toggle('active', mode === 'import');

    // Update sections
    const createSection = document.getElementById('create-section');
    const importSection = document.getElementById('import-section');
    if (createSection) createSection.classList.toggle('active', mode === 'create');
    if (importSection) importSection.classList.toggle('active', mode === 'import');

    // Clear status
    this.updateStatus('', 'info');
  }

  private validateImportAddressFormat(e: Event) {
    const input = e.target as HTMLInputElement;
    const address = input.value.trim();
    const error = this.connectorService.validateContractAddress(address);
    
    // You could add visual feedback here (red border, etc.)
    if (error && address.length > 0) {
      input.style.borderColor = '#dc3545';
      input.title = error;
    } else {
      input.style.borderColor = '';
      input.title = '';
    }
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

  private async handleImportVerify() {
    try {
      const addressInput = document.getElementById('wc-import-address') as HTMLInputElement;
      const contractAddress = addressInput.value.trim();

      // Validate format first
      const validation = this.connectorService.validateContractAddress(contractAddress);
      if (validation) {
        this.updateStatus(`Validation failed: ${validation}`, 'error');
        return;
      }

      this.updateStatus('Verifying wallet contract on-chain...', 'info');

      // Import and verify the wallet
      const walletInfo = await this.connectorService.importWallet(contractAddress);

      // Display results
      this.displayImportResults(walletInfo);

      if (walletInfo.isSmartWallet) {
        this.updateStatus('Smart wallet imported successfully!', 'success');
      } else {
        this.updateStatus(
          walletInfo.errorMessage || 'Could not verify wallet. Please check the address.',
          'error'
        );
      }
    } catch (err: any) {
      this.updateStatus(`Import failed: ${err.message}`, 'error');
    }
  }

  private displayImportResults(walletInfo: ImportedWalletInfo) {
    const resultsContainer = document.getElementById('wc-import-results');
    if (!resultsContainer) return;

    // Clear previous results safely
    resultsContainer.textContent = '';
    resultsContainer.style.display = 'block';

    // Helper to create and append elements
    const createItem = (label: string, value: string, isCode = false, statusClass?: string) => {
      const div = document.createElement('div');
      div.className = 'result-item';
      
      const strong = document.createElement('strong');
      strong.textContent = label + ': ';
      div.appendChild(strong);

      const span = document.createElement(isCode ? 'code' : 'span');
      span.textContent = value;
      if (statusClass) span.className = statusClass;
      div.appendChild(span);
      
      resultsContainer.appendChild(div);
      return div;
    };

    createItem('Contract Address', walletInfo.address, true);
    
    createItem(
      'Status', 
      walletInfo.isSmartWallet ? '✓ Valid Smart Wallet' : '✗ Invalid or Unable to Verify',
      false,
      walletInfo.isSmartWallet ? 'status-success' : 'status-error'
    );

    if (walletInfo.errorMessage) {
      const errorDiv = createItem('Error', walletInfo.errorMessage);
      errorDiv.classList.add('error');
    }

    if (walletInfo.signers && walletInfo.signers.length > 0) {
      const signersHeader = document.createElement('div');
      signersHeader.className = 'result-item';
      const strong = document.createElement('strong');
      strong.textContent = 'Active Signers:';
      signersHeader.appendChild(strong);
      
      const signersList = document.createElement('div');
      signersList.style.marginTop = '5px';
      
      walletInfo.signers.forEach((signer, idx) => {
        const item = document.createElement('div');
        item.style.cssText = 'margin: 5px 0; padding: 5px; background: #f0f0f0; border-radius: 3px;';
        item.textContent = `#${idx + 1} | ${signer.type}${signer.isActive ? ' ✓ Active' : ' ✗ Inactive'}`;
        signersList.appendChild(item);
      });
      
      signersHeader.appendChild(signersList);
      resultsContainer.appendChild(signersHeader);
    } else if (walletInfo.isSmartWallet) {
      createItem('Signers', 'No signers fetched (implementation pending)');
    }
  }

  private updateStatus(msg: string, type: 'info' | 'success' | 'error') {
    if (this.statusDisplay) {
      this.statusDisplay.textContent = msg;
      this.statusDisplay.className = `status ${msg ? `status-${type}` : ''}`;
    }
  }
}

