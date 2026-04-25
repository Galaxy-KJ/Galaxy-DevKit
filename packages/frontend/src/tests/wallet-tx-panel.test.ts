/**
 * @jest-environment jest-environment-jsdom
 *
 * WalletTxPanel DOM tests.
 * TxBuilderClient network calls are mocked via jest.mock so these
 * tests run without a live RPC endpoint.
 */

import { WalletTxPanel } from '../panels/wallet-tx';

const mockBuildAndSimulate = jest.fn();
const mockSubmitSignedXdr = jest.fn();
const mockAssembleFromSimulation = jest.fn().mockReturnValue('assembled-xdr');

jest.mock('../services/tx-builder.client', () => ({
  TxBuilderClient: jest.fn().mockImplementation(() => ({
    buildAndSimulate: mockBuildAndSimulate,
    submitSignedXdr: mockSubmitSignedXdr,
    assembleFromSimulation: mockAssembleFromSimulation,
  })),
}));

function makeContainer(): HTMLDivElement {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

function makeCallbacks() {
  return {
    onSign: jest.fn().mockResolvedValue('signed-xdr'),
    onSubmit: jest.fn().mockResolvedValue('txhash123'),
    onConfirmed: jest.fn(),
  };
}

describe('WalletTxPanel', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = makeContainer();
    jest.clearAllMocks();
  });

  afterEach(() => {
    container.remove();
  });

  it('renders the form with all required fields', () => {
    new WalletTxPanel(container, { rpcUrl: 'https://rpc' }, makeCallbacks());
    expect(container.querySelector('#tx-form')).not.toBeNull();
    expect(container.querySelector('#tx-wallet-address')).not.toBeNull();
    expect(container.querySelector('#tx-destination')).not.toBeNull();
    expect(container.querySelector('#tx-amount')).not.toBeNull();
    expect(container.querySelector('#tx-credential-id')).not.toBeNull();
    expect(container.querySelector('#tx-memo')).not.toBeNull();
  });

  it('sets aria-label on the region', () => {
    new WalletTxPanel(container, { rpcUrl: 'https://rpc' }, makeCallbacks());
    expect(container.getAttribute('aria-label')).toBe('Transaction builder');
  });

  it('Sign & Submit button is disabled before simulate', () => {
    new WalletTxPanel(container, { rpcUrl: 'https://rpc' }, makeCallbacks());
    const btn = container.querySelector('#tx-sign-submit-btn') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('shows status message when simulate is clicked without required fields', async () => {
    new WalletTxPanel(container, { rpcUrl: 'https://rpc' }, makeCallbacks());
    const simulateBtn = container.querySelector('#tx-simulate-btn') as HTMLButtonElement;
    simulateBtn.click();
    await Promise.resolve();
    const status = container.querySelector('#tx-status') as HTMLElement;
    expect(status.textContent).toContain('required');
  });

  it('calls buildAndSimulate with correct params and enables Sign & Submit', async () => {
    mockBuildAndSimulate.mockResolvedValue({
      resourceFee: '300',
      authEntryCount: 1,
      raw: {},
      transaction: {},
    });

    new WalletTxPanel(container, { rpcUrl: 'https://rpc' }, makeCallbacks());
    (container.querySelector('#tx-wallet-address') as HTMLInputElement).value = 'CWALLET';
    (container.querySelector('#tx-destination') as HTMLInputElement).value = 'GDEST';
    (container.querySelector('#tx-amount') as HTMLInputElement).value = '10';

    const simulateBtn = container.querySelector('#tx-simulate-btn') as HTMLButtonElement;
    simulateBtn.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockBuildAndSimulate).toHaveBeenCalledWith(
      expect.objectContaining({ walletAddress: 'CWALLET', destination: 'GDEST', amount: '10' })
    );
    const signBtn = container.querySelector('#tx-sign-submit-btn') as HTMLButtonElement;
    expect(signBtn.disabled).toBe(false);
  });

  it('shows simulation preview after successful simulate', async () => {
    mockBuildAndSimulate.mockResolvedValue({
      resourceFee: '500',
      authEntryCount: 1,
      raw: {},
      transaction: {},
    });

    new WalletTxPanel(container, { rpcUrl: 'https://rpc' }, makeCallbacks());
    (container.querySelector('#tx-wallet-address') as HTMLInputElement).value = 'CW';
    (container.querySelector('#tx-destination') as HTMLInputElement).value = 'GD';
    (container.querySelector('#tx-amount') as HTMLInputElement).value = '5';

    (container.querySelector('#tx-simulate-btn') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();

    const preview = container.querySelector('#tx-preview-section') as HTMLElement;
    expect(preview.hidden).toBe(false);
    expect(container.querySelector('#tx-preview-pre')?.textContent).toContain('500 stroops (Soroban resource component only)');
  });

  it('shows error status when simulate fails', async () => {
    mockBuildAndSimulate.mockRejectedValue(new Error('RPC timeout'));

    new WalletTxPanel(container, { rpcUrl: 'https://rpc' }, makeCallbacks());
    (container.querySelector('#tx-wallet-address') as HTMLInputElement).value = 'CW';
    (container.querySelector('#tx-destination') as HTMLInputElement).value = 'GD';
    (container.querySelector('#tx-amount') as HTMLInputElement).value = '1';

    (container.querySelector('#tx-simulate-btn') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();

    expect((container.querySelector('#tx-status') as HTMLElement).textContent).toContain('RPC timeout');
  });

  it('calls onSign and onSubmit on form submit, shows confirmation', async () => {
    mockBuildAndSimulate.mockResolvedValue({ resourceFee: '100', authEntryCount: 1, raw: {}, transaction: {} });
    const cbs = makeCallbacks();

    new WalletTxPanel(container, { rpcUrl: 'https://rpc' }, cbs);
    (container.querySelector('#tx-wallet-address') as HTMLInputElement).value = 'CW';
    (container.querySelector('#tx-credential-id') as HTMLInputElement).value = 'CRED';
    (container.querySelector('#tx-destination') as HTMLInputElement).value = 'GD';
    (container.querySelector('#tx-amount') as HTMLInputElement).value = '2';

    // Simulate first
    (container.querySelector('#tx-simulate-btn') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();

    // Sign & Submit
    const form = container.querySelector('#tx-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(cbs.onSign).toHaveBeenCalled();
    expect(cbs.onSubmit).toHaveBeenCalledWith('signed-xdr');
    const confirmation = container.querySelector('#tx-confirmation') as HTMLElement;
    expect(confirmation.hidden).toBe(false);
    expect(confirmation.textContent).toContain('txhash123');
    expect(cbs.onConfirmed).toHaveBeenCalledWith('txhash123');
  });
});
