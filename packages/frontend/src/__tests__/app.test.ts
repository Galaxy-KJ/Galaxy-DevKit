/**
 * @jest-environment jsdom
 */

import { getPlaygroundStatus, renderPlayground } from '../app';

jest.mock('@galaxy-kj/core-stellar-sdk', () => ({
  Keypair: {
    random: () => ({
      publicKey: () => 'GPLAYGROUNDTESTACCOUNT',
    }),
  },
  Networks: {
    TESTNET: 'Test SDF Network ; September 2015',
  },
}));

jest.mock('../services/smart-wallet.client', () => ({
  SmartWalletClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../panels/wallet-create', () => ({
  WalletCreatePanel: jest.fn().mockImplementation(() => undefined),
}));

jest.mock('../panels/wallet-signers', () => ({
  WalletSignersPanel: jest.fn().mockImplementation(() => undefined),
}));

describe('playground app', () => {
  it('reports that the Stellar SDK workspace import is usable', () => {
    expect(getPlaygroundStatus()).toEqual({
      network: 'Test SDF Network ; September 2015',
      sdkReady: true,
      generatedAccount: 'GPLAYGROUNDTESTACCOUNT',
    });
  });

  it('renders the status cards and wallet panel mount points', () => {
    document.body.innerHTML = '<main id="app"></main>';
    const root = document.getElementById('app')!;

    const status = renderPlayground(root);

    expect(status.sdkReady).toBe(true);
    expect(root.textContent).toContain('Smart wallet playground');
    expect(root.textContent).toContain('GPLAYGROUNDTESTACCOUNT');
    expect(document.getElementById('wallet-create-panel')).not.toBeNull();
    expect(document.getElementById('wallet-signers-panel')).not.toBeNull();
  });
});
