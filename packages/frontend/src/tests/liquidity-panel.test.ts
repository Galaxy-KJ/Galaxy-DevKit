/**
 * @jest-environment jest-environment-jsdom
 *
 * LiquidityPanel DOM tests.
 * All SDK calls are injected via the callback interface so these tests
 * run without network access and can assert full DOM behaviour.
 */

import {
  LiquidityPanel,
  type LiquidityPanelCallbacks,
} from '../panels/liquidity';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeContainer(): HTMLDivElement {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

/** Minimal Asset stub matching the Stellar SDK shape used in the panel */
function stubAsset(code: string, native = false) {
  return {
    isNative: () => native,
    getCode: () => code,
    getIssuer: () => 'GISSUER',
  };
}

const MOCK_POOL = {
  id: 'a'.repeat(64),
  assetA: stubAsset('XLM', true),
  assetB: stubAsset('USDC'),
  reserveA: '10000.0000000',
  reserveB: '5000.0000000',
  totalShares: '7071.0000000',
  totalTrustlines: 42,
  fee: 30,
};

const MOCK_ANALYTICS = {
  tvl: '15000.0000000',
  sharePrice: '1.4142135',
};

const MOCK_DEPOSIT_ESTIMATE = {
  shares: '100.0000000',
  actualAmountA: '141.4213562',
  actualAmountB: '70.7106781',
  sharePrice: '1.4142135',
  priceImpact: '0.05',
  poolShare: '1.39',
};

const MOCK_WITHDRAW_ESTIMATE = {
  amountA: '141.4213562',
  amountB: '70.7106781',
  sharePrice: '1.4142135',
  priceImpact: '0.03',
};

function makeCallbacks(
  overrides: Partial<LiquidityPanelCallbacks> = {},
): LiquidityPanelCallbacks {
  return {
    onQueryPool: jest.fn().mockResolvedValue(MOCK_POOL),
    onGetAnalytics: jest.fn().mockResolvedValue(MOCK_ANALYTICS),
    onEstimateDeposit: jest.fn().mockResolvedValue(MOCK_DEPOSIT_ESTIMATE),
    onEstimateWithdraw: jest.fn().mockResolvedValue(MOCK_WITHDRAW_ESTIMATE),
    onDeposit: jest.fn().mockResolvedValue('txhash_deposit_abc'),
    onWithdraw: jest.fn().mockResolvedValue('txhash_withdraw_xyz'),
    onGetUserShares: jest.fn().mockResolvedValue('50.0000000'),
    onCalculateIL: jest.fn().mockReturnValue('2.34'),
    ...overrides,
  };
}

/** Flush all pending microtasks (async callback chains) */
async function flush(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('LiquidityPanel', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    container.remove();
  });

  // ── Rendering ──────────────────────────────────────────────────────

  it('renders the lookup form and heading', () => {
    new LiquidityPanel(container, makeCallbacks());
    expect(container.querySelector('#lp-panel-heading')?.textContent).toBe('Liquidity Pools');
    expect(container.querySelector('#lp-lookup-form')).not.toBeNull();
    expect(container.querySelector('#lp-asset-a')).not.toBeNull();
    expect(container.querySelector('#lp-asset-b')).not.toBeNull();
  });

  it('sets aria-label on the region', () => {
    new LiquidityPanel(container, makeCallbacks());
    expect(container.getAttribute('aria-label')).toBe('Liquidity pool management');
  });

  it('hides deposit and withdraw sections initially', () => {
    new LiquidityPanel(container, makeCallbacks());
    expect((container.querySelector('#lp-deposit-section') as HTMLElement).hidden).toBe(true);
    expect((container.querySelector('#lp-withdraw-section') as HTMLElement).hidden).toBe(true);
    expect((container.querySelector('#lp-analytics-section') as HTMLElement).hidden).toBe(true);
  });

  // ── Pool lookup ────────────────────────────────────────────────────

  it('shows error when lookup submitted without assets', async () => {
    new LiquidityPanel(container, makeCallbacks());
    const form = container.querySelector('#lp-lookup-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
    expect((container.querySelector('#lp-status') as HTMLElement).textContent).toContain('required');
  });

  it('calls onQueryPool and displays pool info on successful lookup', async () => {
    const cbs = makeCallbacks();
    new LiquidityPanel(container, cbs);

    (container.querySelector('#lp-asset-a') as HTMLInputElement).value = 'native';
    (container.querySelector('#lp-asset-b') as HTMLInputElement).value = 'USDC:GISSUER';

    const form = container.querySelector('#lp-lookup-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect(cbs.onQueryPool).toHaveBeenCalledWith('native', 'USDC:GISSUER');

    // Pool info rendered
    expect(container.querySelector('#lp-pool-id')?.textContent).toBe('a'.repeat(64));
    expect(container.querySelector('#lp-pair')?.textContent).toBe('XLM/USDC');
    expect(container.querySelector('#lp-reserve-a')?.textContent).toBe('10000.0000000');
    expect(container.querySelector('#lp-reserve-b')?.textContent).toBe('5000.0000000');
    expect(container.querySelector('#lp-total-shares')?.textContent).toBe('7071.0000000');
  });

  it('shows analytics after successful lookup', async () => {
    new LiquidityPanel(container, makeCallbacks());

    (container.querySelector('#lp-asset-a') as HTMLInputElement).value = 'native';
    (container.querySelector('#lp-asset-b') as HTMLInputElement).value = 'USDC:GA';
    (container.querySelector('#lp-lookup-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect((container.querySelector('#lp-analytics-section') as HTMLElement).hidden).toBe(false);
    expect(container.querySelector('#lp-tvl')?.textContent).toBe('15000.0000000');
    expect(container.querySelector('#lp-share-price')?.textContent).toBe('1.4142135');
  });

  it('displays user shares after lookup', async () => {
    new LiquidityPanel(container, makeCallbacks());

    (container.querySelector('#lp-asset-a') as HTMLInputElement).value = 'native';
    (container.querySelector('#lp-asset-b') as HTMLInputElement).value = 'USDC:GA';
    (container.querySelector('#lp-lookup-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect(container.querySelector('#lp-user-shares')?.textContent).toBe('50.0000000');
  });

  it('shows message when no pool found', async () => {
    const cbs = makeCallbacks({ onQueryPool: jest.fn().mockResolvedValue(null) });
    new LiquidityPanel(container, cbs);

    (container.querySelector('#lp-asset-a') as HTMLInputElement).value = 'native';
    (container.querySelector('#lp-asset-b') as HTMLInputElement).value = 'FAKE:GA';
    (container.querySelector('#lp-lookup-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect((container.querySelector('#lp-status') as HTMLElement).textContent).toContain('No pool found');
  });

  it('shows error when lookup rejects', async () => {
    const cbs = makeCallbacks({ onQueryPool: jest.fn().mockRejectedValue(new Error('Network error')) });
    new LiquidityPanel(container, cbs);

    (container.querySelector('#lp-asset-a') as HTMLInputElement).value = 'native';
    (container.querySelector('#lp-asset-b') as HTMLInputElement).value = 'USDC:GA';
    (container.querySelector('#lp-lookup-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect((container.querySelector('#lp-status') as HTMLElement).textContent).toContain('Network error');
  });

  // ── Deposit ────────────────────────────────────────────────────────

  it('shows deposit section after lookup', async () => {
    new LiquidityPanel(container, makeCallbacks());

    (container.querySelector('#lp-asset-a') as HTMLInputElement).value = 'native';
    (container.querySelector('#lp-asset-b') as HTMLInputElement).value = 'USDC:GA';
    (container.querySelector('#lp-lookup-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect((container.querySelector('#lp-deposit-section') as HTMLElement).hidden).toBe(false);
  });

  it('shows deposit estimate preview', async () => {
    const cbs = makeCallbacks();
    new LiquidityPanel(container, cbs);

    // First do lookup
    (container.querySelector('#lp-asset-a') as HTMLInputElement).value = 'native';
    (container.querySelector('#lp-asset-b') as HTMLInputElement).value = 'USDC:GA';
    (container.querySelector('#lp-lookup-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    // Fill deposit amounts
    (container.querySelector('#lp-deposit-a') as HTMLInputElement).value = '100';
    (container.querySelector('#lp-deposit-b') as HTMLInputElement).value = '50';

    // Click estimate
    (container.querySelector('#lp-deposit-estimate-btn') as HTMLButtonElement).click();
    await flush();

    expect(cbs.onEstimateDeposit).toHaveBeenCalledWith('a'.repeat(64), '100', '50');
    expect((container.querySelector('#lp-deposit-preview') as HTMLElement).hidden).toBe(false);
    expect(container.querySelector('#lp-est-shares')?.textContent).toBe('100.0000000');
    expect(container.querySelector('#lp-est-impact')?.textContent).toBe('0.05%');
    expect(container.querySelector('#lp-est-pool-share')?.textContent).toBe('1.39%');
  });

  it('enables deposit button after successful estimate', async () => {
    new LiquidityPanel(container, makeCallbacks());

    (container.querySelector('#lp-asset-a') as HTMLInputElement).value = 'native';
    (container.querySelector('#lp-asset-b') as HTMLInputElement).value = 'USDC:GA';
    (container.querySelector('#lp-lookup-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    (container.querySelector('#lp-deposit-a') as HTMLInputElement).value = '100';
    (container.querySelector('#lp-deposit-b') as HTMLInputElement).value = '50';
    (container.querySelector('#lp-deposit-estimate-btn') as HTMLButtonElement).click();
    await flush();

    expect((container.querySelector('#lp-deposit-btn') as HTMLButtonElement).disabled).toBe(false);
  });

  it('deposit button is disabled before estimate', async () => {
    new LiquidityPanel(container, makeCallbacks());

    (container.querySelector('#lp-asset-a') as HTMLInputElement).value = 'native';
    (container.querySelector('#lp-asset-b') as HTMLInputElement).value = 'USDC:GA';
    (container.querySelector('#lp-lookup-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect((container.querySelector('#lp-deposit-btn') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows status when deposit amounts are missing', async () => {
    new LiquidityPanel(container, makeCallbacks());

    (container.querySelector('#lp-asset-a') as HTMLInputElement).value = 'native';
    (container.querySelector('#lp-asset-b') as HTMLInputElement).value = 'USDC:GA';
    (container.querySelector('#lp-lookup-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    // Don't fill deposit amounts, just click estimate
    (container.querySelector('#lp-deposit-estimate-btn') as HTMLButtonElement).click();
    await flush();

    expect((container.querySelector('#lp-deposit-status') as HTMLElement).textContent).toContain('required');
  });

  it('executes deposit and shows tx hash', async () => {
    const cbs = makeCallbacks();
    new LiquidityPanel(container, cbs);

    (container.querySelector('#lp-asset-a') as HTMLInputElement).value = 'native';
    (container.querySelector('#lp-asset-b') as HTMLInputElement).value = 'USDC:GA';
    (container.querySelector('#lp-lookup-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    (container.querySelector('#lp-deposit-a') as HTMLInputElement).value = '100';
    (container.querySelector('#lp-deposit-b') as HTMLInputElement).value = '50';

    // Estimate first to enable button
    (container.querySelector('#lp-deposit-estimate-btn') as HTMLButtonElement).click();
    await flush();

    // Submit deposit
    (container.querySelector('#lp-deposit-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect(cbs.onDeposit).toHaveBeenCalledWith('a'.repeat(64), '100', '50');
    expect((container.querySelector('#lp-deposit-status') as HTMLElement).textContent).toContain('txhash_deposit_abc');
  });

  it('shows error when deposit fails', async () => {
    const cbs = makeCallbacks({ onDeposit: jest.fn().mockRejectedValue(new Error('Insufficient balance')) });
    new LiquidityPanel(container, cbs);

    (container.querySelector('#lp-asset-a') as HTMLInputElement).value = 'native';
    (container.querySelector('#lp-asset-b') as HTMLInputElement).value = 'USDC:GA';
    (container.querySelector('#lp-lookup-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    (container.querySelector('#lp-deposit-a') as HTMLInputElement).value = '100';
    (container.querySelector('#lp-deposit-b') as HTMLInputElement).value = '50';
    (container.querySelector('#lp-deposit-estimate-btn') as HTMLButtonElement).click();
    await flush();

    (container.querySelector('#lp-deposit-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect((container.querySelector('#lp-deposit-status') as HTMLElement).textContent).toContain('Insufficient balance');
  });

  // ── Withdraw ───────────────────────────────────────────────────────

  it('shows withdraw section after lookup', async () => {
    new LiquidityPanel(container, makeCallbacks());

    (container.querySelector('#lp-asset-a') as HTMLInputElement).value = 'native';
    (container.querySelector('#lp-asset-b') as HTMLInputElement).value = 'USDC:GA';
    (container.querySelector('#lp-lookup-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect((container.querySelector('#lp-withdraw-section') as HTMLElement).hidden).toBe(false);
  });

  it('shows withdrawal estimate preview', async () => {
    const cbs = makeCallbacks();
    new LiquidityPanel(container, cbs);

    (container.querySelector('#lp-asset-a') as HTMLInputElement).value = 'native';
    (container.querySelector('#lp-asset-b') as HTMLInputElement).value = 'USDC:GA';
    (container.querySelector('#lp-lookup-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    (container.querySelector('#lp-withdraw-shares') as HTMLInputElement).value = '25';
    (container.querySelector('#lp-withdraw-estimate-btn') as HTMLButtonElement).click();
    await flush();

    expect(cbs.onEstimateWithdraw).toHaveBeenCalledWith('a'.repeat(64), '25');
    expect((container.querySelector('#lp-withdraw-preview') as HTMLElement).hidden).toBe(false);
    expect(container.querySelector('#lp-west-a')?.textContent).toBe('141.4213562');
    expect(container.querySelector('#lp-west-b')?.textContent).toBe('70.7106781');
  });

  it('executes withdrawal and shows tx hash', async () => {
    const cbs = makeCallbacks();
    new LiquidityPanel(container, cbs);

    (container.querySelector('#lp-asset-a') as HTMLInputElement).value = 'native';
    (container.querySelector('#lp-asset-b') as HTMLInputElement).value = 'USDC:GA';
    (container.querySelector('#lp-lookup-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    (container.querySelector('#lp-withdraw-shares') as HTMLInputElement).value = '25';
    (container.querySelector('#lp-withdraw-estimate-btn') as HTMLButtonElement).click();
    await flush();

    (container.querySelector('#lp-withdraw-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect(cbs.onWithdraw).toHaveBeenCalledWith('a'.repeat(64), '25');
    expect((container.querySelector('#lp-withdraw-status') as HTMLElement).textContent).toContain('txhash_withdraw_xyz');
  });

  it('shows error when shares field is empty on withdraw estimate', async () => {
    new LiquidityPanel(container, makeCallbacks());

    (container.querySelector('#lp-asset-a') as HTMLInputElement).value = 'native';
    (container.querySelector('#lp-asset-b') as HTMLInputElement).value = 'USDC:GA';
    (container.querySelector('#lp-lookup-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    (container.querySelector('#lp-withdraw-estimate-btn') as HTMLButtonElement).click();
    await flush();

    expect((container.querySelector('#lp-withdraw-status') as HTMLElement).textContent).toContain('required');
  });

  it('shows error when withdrawal fails', async () => {
    const cbs = makeCallbacks({ onWithdraw: jest.fn().mockRejectedValue(new Error('Insufficient shares')) });
    new LiquidityPanel(container, cbs);

    (container.querySelector('#lp-asset-a') as HTMLInputElement).value = 'native';
    (container.querySelector('#lp-asset-b') as HTMLInputElement).value = 'USDC:GA';
    (container.querySelector('#lp-lookup-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    (container.querySelector('#lp-withdraw-shares') as HTMLInputElement).value = '999';
    (container.querySelector('#lp-withdraw-estimate-btn') as HTMLButtonElement).click();
    await flush();

    (container.querySelector('#lp-withdraw-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    expect((container.querySelector('#lp-withdraw-status') as HTMLElement).textContent).toContain('Insufficient shares');
  });

  // ── Impermanent Loss ───────────────────────────────────────────────

  it('calculates impermanent loss from price inputs', async () => {
    const cbs = makeCallbacks();
    new LiquidityPanel(container, cbs);

    (container.querySelector('#lp-asset-a') as HTMLInputElement).value = 'native';
    (container.querySelector('#lp-asset-b') as HTMLInputElement).value = 'USDC:GA';
    (container.querySelector('#lp-lookup-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    (container.querySelector('#lp-il-initial-price') as HTMLInputElement).value = '1.0';
    (container.querySelector('#lp-il-current-price') as HTMLInputElement).value = '1.5';
    (container.querySelector('#lp-il-btn') as HTMLButtonElement).click();

    expect(cbs.onCalculateIL).toHaveBeenCalledWith('1.0', '1.5');
    expect(container.querySelector('#lp-il-value')?.textContent).toBe('2.34%');
  });

  it('shows error when IL prices are empty', async () => {
    new LiquidityPanel(container, makeCallbacks());

    (container.querySelector('#lp-asset-a') as HTMLInputElement).value = 'native';
    (container.querySelector('#lp-asset-b') as HTMLInputElement).value = 'USDC:GA';
    (container.querySelector('#lp-lookup-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    (container.querySelector('#lp-il-btn') as HTMLButtonElement).click();
    expect((container.querySelector('#lp-il-result') as HTMLElement).textContent).toContain('required');
  });

  // ── Deposit estimate error ─────────────────────────────────────────

  it('shows error and hides preview when deposit estimate fails', async () => {
    const cbs = makeCallbacks({
      onEstimateDeposit: jest.fn().mockRejectedValue(new Error('Pool empty')),
    });
    new LiquidityPanel(container, cbs);

    (container.querySelector('#lp-asset-a') as HTMLInputElement).value = 'native';
    (container.querySelector('#lp-asset-b') as HTMLInputElement).value = 'USDC:GA';
    (container.querySelector('#lp-lookup-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    (container.querySelector('#lp-deposit-a') as HTMLInputElement).value = '100';
    (container.querySelector('#lp-deposit-b') as HTMLInputElement).value = '50';
    (container.querySelector('#lp-deposit-estimate-btn') as HTMLButtonElement).click();
    await flush();

    expect((container.querySelector('#lp-deposit-status') as HTMLElement).textContent).toContain('Pool empty');
    expect((container.querySelector('#lp-deposit-preview') as HTMLElement).hidden).toBe(true);
    expect((container.querySelector('#lp-deposit-btn') as HTMLButtonElement).disabled).toBe(true);
  });

  // ── Withdraw estimate error ────────────────────────────────────────

  it('shows error when withdraw estimate fails', async () => {
    const cbs = makeCallbacks({
      onEstimateWithdraw: jest.fn().mockRejectedValue(new Error('Invalid shares')),
    });
    new LiquidityPanel(container, cbs);

    (container.querySelector('#lp-asset-a') as HTMLInputElement).value = 'native';
    (container.querySelector('#lp-asset-b') as HTMLInputElement).value = 'USDC:GA';
    (container.querySelector('#lp-lookup-form') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();

    (container.querySelector('#lp-withdraw-shares') as HTMLInputElement).value = '10';
    (container.querySelector('#lp-withdraw-estimate-btn') as HTMLButtonElement).click();
    await flush();

    expect((container.querySelector('#lp-withdraw-status') as HTMLElement).textContent).toContain('Invalid shares');
    expect((container.querySelector('#lp-withdraw-preview') as HTMLElement).hidden).toBe(true);
  });
});
