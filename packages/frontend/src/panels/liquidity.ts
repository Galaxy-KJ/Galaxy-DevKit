/**
 * Liquidity pool deposit/withdraw and analytics panel.
 *
 * Renders forms that let users:
 *   1. Select two assets and look up the matching liquidity pool
 *   2. Preview deposit amounts / estimated shares
 *   3. Submit a deposit transaction
 *   4. Withdraw LP shares back to underlying assets
 *   5. View pool analytics (reserves, TVL, share price, impermanent loss)
 *
 * All heavy lifting is delegated to LiquidityPoolManager from
 * @galaxy-kj/core-stellar-sdk via the callback interface so this panel
 * stays network-agnostic and fully testable with mocks.
 */

import type {
  LiquidityPool,
  PoolAnalytics,
  DepositEstimate,
  WithdrawEstimate,
} from '../../../core/stellar-sdk/src/liquidity-pools/types';

/* ------------------------------------------------------------------ */
/*  Public callback / option types                                    */
/* ------------------------------------------------------------------ */

export interface LiquidityPanelCallbacks {
  /** Look up a pool by the two asset codes (e.g. "XLM", "USDC:GA…") */
  onQueryPool: (assetA: string, assetB: string) => Promise<LiquidityPool | null>;
  /** Fetch on-chain analytics for a pool */
  onGetAnalytics: (poolId: string) => Promise<PoolAnalytics>;
  /** Preview a deposit without executing */
  onEstimateDeposit: (poolId: string, amountA: string, amountB: string) => Promise<DepositEstimate>;
  /** Preview a withdrawal without executing */
  onEstimateWithdraw: (poolId: string, shares: string) => Promise<WithdrawEstimate>;
  /** Execute a deposit and return the tx hash */
  onDeposit: (poolId: string, amountA: string, amountB: string) => Promise<string>;
  /** Execute a withdrawal and return the tx hash */
  onWithdraw: (poolId: string, shares: string) => Promise<string>;
  /** Get user's share balance for a pool */
  onGetUserShares: (poolId: string) => Promise<string>;
  /**
   * Calculate impermanent loss percentage given an initial and current
   * price. Returns a string like "2.34".
   */
  onCalculateIL: (initialPrice: string, currentPrice: string) => string;
}

/* ------------------------------------------------------------------ */
/*  Panel class                                                       */
/* ------------------------------------------------------------------ */

export class LiquidityPanel {
  private container: HTMLElement;
  private callbacks: LiquidityPanelCallbacks;

  /** Currently-loaded pool (set after a successful query) */
  private pool: LiquidityPool | null = null;

  constructor(container: HTMLElement, callbacks: LiquidityPanelCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.render();
  }

  /* ================================================================ */
  /*  Top-level render                                                */
  /* ================================================================ */

  private render(): void {
    this.container.innerHTML = '';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Liquidity pool management');

    const heading = document.createElement('h2');
    heading.id = 'lp-panel-heading';
    heading.textContent = 'Liquidity Pools';
    this.container.appendChild(heading);

    // Pool lookup
    this.container.appendChild(this.buildPoolLookupSection());

    // Analytics (hidden until pool loaded)
    const analyticsSection = document.createElement('section');
    analyticsSection.id = 'lp-analytics-section';
    analyticsSection.hidden = true;
    analyticsSection.setAttribute('aria-label', 'Pool analytics');
    this.container.appendChild(analyticsSection);

    // Deposit form (hidden until pool loaded)
    this.container.appendChild(this.buildDepositSection());

    // Withdraw form (hidden until pool loaded)
    this.container.appendChild(this.buildWithdrawSection());

    // Global status
    const status = document.createElement('p');
    status.id = 'lp-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    this.container.appendChild(status);
  }

  /* ================================================================ */
  /*  Pool lookup                                                     */
  /* ================================================================ */

  private buildPoolLookupSection(): HTMLFormElement {
    const form = document.createElement('form');
    form.id = 'lp-lookup-form';
    form.setAttribute('aria-labelledby', 'lp-panel-heading');
    form.setAttribute('novalidate', '');

    form.appendChild(
      this.buildField({
        id: 'lp-asset-a',
        label: 'Asset A (e.g. native or CODE:ISSUER)',
        type: 'text',
        placeholder: 'native',
        required: true,
      }),
    );

    form.appendChild(
      this.buildField({
        id: 'lp-asset-b',
        label: 'Asset B (e.g. USDC:GA…)',
        type: 'text',
        placeholder: 'USDC:GBBD47IF…',
        required: true,
      }),
    );

    const lookupBtn = document.createElement('button');
    lookupBtn.type = 'submit';
    lookupBtn.id = 'lp-lookup-btn';
    lookupBtn.textContent = 'Find Pool';
    form.appendChild(lookupBtn);

    // Pool info display
    const poolInfo = document.createElement('div');
    poolInfo.id = 'lp-pool-info';
    poolInfo.hidden = true;
    poolInfo.setAttribute('aria-label', 'Pool details');
    form.appendChild(poolInfo);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.handleLookup();
    });

    return form;
  }

  private async handleLookup(): Promise<void> {
    const assetA = (this.container.querySelector('#lp-asset-a') as HTMLInputElement).value.trim();
    const assetB = (this.container.querySelector('#lp-asset-b') as HTMLInputElement).value.trim();
    const status = this.container.querySelector('#lp-status') as HTMLElement;

    if (!assetA || !assetB) {
      status.textContent = 'Both asset fields are required.';
      return;
    }

    status.textContent = 'Looking up pool…';
    try {
      const pool = await this.callbacks.onQueryPool(assetA, assetB);
      if (!pool) {
        status.textContent = 'No pool found for the given asset pair.';
        this.hidePoolSections();
        return;
      }

      this.pool = pool;
      this.renderPoolInfo(pool);
      await this.renderAnalytics(pool.id);
      await this.renderUserShares(pool.id);
      this.showPoolSections();
      status.textContent = '';
    } catch (err) {
      status.textContent = `Lookup failed: ${err instanceof Error ? err.message : String(err)}`;
      this.hidePoolSections();
    }
  }

  /* ================================================================ */
  /*  Pool info display                                               */
  /* ================================================================ */

  private renderPoolInfo(pool: LiquidityPool): void {
    const info = this.container.querySelector('#lp-pool-info') as HTMLElement;
    const assetACode = pool.assetA.isNative() ? 'XLM' : pool.assetA.getCode();
    const assetBCode = pool.assetB.isNative() ? 'XLM' : pool.assetB.getCode();

    info.innerHTML = `
      <div class="result-item"><strong>Pool ID:</strong> <code id="lp-pool-id">${pool.id}</code></div>
      <div class="result-item"><strong>Pair:</strong> <span id="lp-pair">${assetACode}/${assetBCode}</span></div>
      <div class="result-item"><strong>Reserve A:</strong> <span id="lp-reserve-a">${pool.reserveA}</span> ${assetACode}</div>
      <div class="result-item"><strong>Reserve B:</strong> <span id="lp-reserve-b">${pool.reserveB}</span> ${assetBCode}</div>
      <div class="result-item"><strong>Total Shares:</strong> <span id="lp-total-shares">${pool.totalShares}</span></div>
      <div class="result-item"><strong>Fee:</strong> ${pool.fee} bp (${(pool.fee / 100).toFixed(2)}%)</div>
    `;
    info.hidden = false;
  }

  /* ================================================================ */
  /*  Analytics                                                       */
  /* ================================================================ */

  private async renderAnalytics(poolId: string): Promise<void> {
    const section = this.container.querySelector('#lp-analytics-section') as HTMLElement;
    try {
      const analytics = await this.callbacks.onGetAnalytics(poolId);
      section.innerHTML = `
        <h3>Pool Analytics</h3>
        <div class="result-item"><strong>TVL (reserves):</strong> <span id="lp-tvl">${analytics.tvl}</span></div>
        <div class="result-item"><strong>Share Price:</strong> <span id="lp-share-price">${analytics.sharePrice}</span></div>
        ${analytics.volume24h ? `<div class="result-item"><strong>24h Volume:</strong> ${analytics.volume24h}</div>` : ''}
        ${analytics.apy ? `<div class="result-item"><strong>APY:</strong> ${analytics.apy}%</div>` : ''}
      `;
    } catch {
      section.innerHTML = '<p>Unable to load analytics.</p>';
    }
  }

  /* ================================================================ */
  /*  User shares                                                     */
  /* ================================================================ */

  private async renderUserShares(poolId: string): Promise<void> {
    const section = this.container.querySelector('#lp-analytics-section') as HTMLElement;
    try {
      const shares = await this.callbacks.onGetUserShares(poolId);
      const sharesDiv = document.createElement('div');
      sharesDiv.className = 'result-item';
      sharesDiv.innerHTML = `<strong>Your Shares:</strong> <span id="lp-user-shares">${shares}</span>`;
      section.appendChild(sharesDiv);
    } catch {
      // Non-critical — user may not be connected
    }
  }

  /* ================================================================ */
  /*  Deposit form                                                    */
  /* ================================================================ */

  private buildDepositSection(): HTMLElement {
    const section = document.createElement('section');
    section.id = 'lp-deposit-section';
    section.hidden = true;
    section.setAttribute('aria-label', 'Deposit liquidity');

    const heading = document.createElement('h3');
    heading.textContent = 'Deposit';
    section.appendChild(heading);

    const form = document.createElement('form');
    form.id = 'lp-deposit-form';
    form.setAttribute('novalidate', '');

    form.appendChild(this.buildField({ id: 'lp-deposit-a', label: 'Amount A', type: 'number', placeholder: '0.00', required: true }));
    form.appendChild(this.buildField({ id: 'lp-deposit-b', label: 'Amount B', type: 'number', placeholder: '0.00', required: true }));

    // Estimate preview
    const preview = document.createElement('div');
    preview.id = 'lp-deposit-preview';
    preview.hidden = true;
    preview.setAttribute('aria-label', 'Deposit estimate');
    form.appendChild(preview);

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'btn-row';

    const estimateBtn = document.createElement('button');
    estimateBtn.type = 'button';
    estimateBtn.id = 'lp-deposit-estimate-btn';
    estimateBtn.textContent = 'Preview Deposit';
    btnRow.appendChild(estimateBtn);

    const depositBtn = document.createElement('button');
    depositBtn.type = 'submit';
    depositBtn.id = 'lp-deposit-btn';
    depositBtn.textContent = 'Deposit';
    depositBtn.disabled = true;
    btnRow.appendChild(depositBtn);

    form.appendChild(btnRow);

    // Deposit status
    const depositStatus = document.createElement('p');
    depositStatus.id = 'lp-deposit-status';
    depositStatus.setAttribute('role', 'status');
    depositStatus.setAttribute('aria-live', 'polite');
    form.appendChild(depositStatus);

    estimateBtn.addEventListener('click', () => void this.handleDepositEstimate());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.handleDeposit();
    });

    section.appendChild(form);
    return section;
  }

  private async handleDepositEstimate(): Promise<void> {
    if (!this.pool) return;
    const amountA = (this.container.querySelector('#lp-deposit-a') as HTMLInputElement).value.trim();
    const amountB = (this.container.querySelector('#lp-deposit-b') as HTMLInputElement).value.trim();
    const preview = this.container.querySelector('#lp-deposit-preview') as HTMLElement;
    const depositBtn = this.container.querySelector('#lp-deposit-btn') as HTMLButtonElement;
    const status = this.container.querySelector('#lp-deposit-status') as HTMLElement;

    if (!amountA || !amountB) {
      status.textContent = 'Both deposit amounts are required.';
      return;
    }

    status.textContent = 'Estimating…';
    try {
      const est = await this.callbacks.onEstimateDeposit(this.pool.id, amountA, amountB);
      preview.innerHTML = `
        <div class="result-item"><strong>Shares Received:</strong> <span id="lp-est-shares">${est.shares}</span></div>
        <div class="result-item"><strong>Actual A:</strong> <span id="lp-est-actual-a">${est.actualAmountA}</span></div>
        <div class="result-item"><strong>Actual B:</strong> <span id="lp-est-actual-b">${est.actualAmountB}</span></div>
        <div class="result-item"><strong>Price Impact:</strong> <span id="lp-est-impact">${est.priceImpact}%</span></div>
        <div class="result-item"><strong>Pool Share:</strong> <span id="lp-est-pool-share">${est.poolShare}%</span></div>
      `;
      preview.hidden = false;
      depositBtn.disabled = false;
      status.textContent = '';
    } catch (err) {
      status.textContent = `Estimate failed: ${err instanceof Error ? err.message : String(err)}`;
      preview.hidden = true;
      depositBtn.disabled = true;
    }
  }

  private async handleDeposit(): Promise<void> {
    if (!this.pool) return;
    const amountA = (this.container.querySelector('#lp-deposit-a') as HTMLInputElement).value.trim();
    const amountB = (this.container.querySelector('#lp-deposit-b') as HTMLInputElement).value.trim();
    const status = this.container.querySelector('#lp-deposit-status') as HTMLElement;
    const depositBtn = this.container.querySelector('#lp-deposit-btn') as HTMLButtonElement;

    depositBtn.disabled = true;
    depositBtn.textContent = 'Depositing…';
    status.textContent = '';

    try {
      const txHash = await this.callbacks.onDeposit(this.pool.id, amountA, amountB);
      status.textContent = `Deposit successful! Tx: ${txHash}`;
      // Re-fetch analytics
      await this.renderAnalytics(this.pool.id);
      await this.renderUserShares(this.pool.id);
    } catch (err) {
      status.textContent = `Deposit failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      depositBtn.disabled = false;
      depositBtn.textContent = 'Deposit';
    }
  }

  /* ================================================================ */
  /*  Withdraw form                                                   */
  /* ================================================================ */

  private buildWithdrawSection(): HTMLElement {
    const section = document.createElement('section');
    section.id = 'lp-withdraw-section';
    section.hidden = true;
    section.setAttribute('aria-label', 'Withdraw liquidity');

    const heading = document.createElement('h3');
    heading.textContent = 'Withdraw';
    section.appendChild(heading);

    const form = document.createElement('form');
    form.id = 'lp-withdraw-form';
    form.setAttribute('novalidate', '');

    form.appendChild(this.buildField({ id: 'lp-withdraw-shares', label: 'Shares to Withdraw', type: 'number', placeholder: '0.00', required: true }));

    // Estimate preview
    const preview = document.createElement('div');
    preview.id = 'lp-withdraw-preview';
    preview.hidden = true;
    preview.setAttribute('aria-label', 'Withdrawal estimate');
    form.appendChild(preview);

    // IL estimate section
    const ilSection = document.createElement('div');
    ilSection.id = 'lp-il-section';
    ilSection.className = 'form-group';

    const ilHeading = document.createElement('h4');
    ilHeading.textContent = 'Impermanent Loss Estimator';
    ilSection.appendChild(ilHeading);

    ilSection.appendChild(this.buildField({ id: 'lp-il-initial-price', label: 'Initial Price (B/A)', type: 'number', placeholder: '1.00' }));
    ilSection.appendChild(this.buildField({ id: 'lp-il-current-price', label: 'Current Price (B/A)', type: 'number', placeholder: '1.50' }));

    const ilBtn = document.createElement('button');
    ilBtn.type = 'button';
    ilBtn.id = 'lp-il-btn';
    ilBtn.textContent = 'Estimate IL';
    ilSection.appendChild(ilBtn);

    const ilResult = document.createElement('div');
    ilResult.id = 'lp-il-result';
    ilSection.appendChild(ilResult);

    ilBtn.addEventListener('click', () => this.handleILEstimate());
    form.appendChild(ilSection);

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'btn-row';

    const estimateBtn = document.createElement('button');
    estimateBtn.type = 'button';
    estimateBtn.id = 'lp-withdraw-estimate-btn';
    estimateBtn.textContent = 'Preview Withdrawal';
    btnRow.appendChild(estimateBtn);

    const withdrawBtn = document.createElement('button');
    withdrawBtn.type = 'submit';
    withdrawBtn.id = 'lp-withdraw-btn';
    withdrawBtn.textContent = 'Withdraw';
    withdrawBtn.disabled = true;
    btnRow.appendChild(withdrawBtn);

    form.appendChild(btnRow);

    // Withdraw status
    const withdrawStatus = document.createElement('p');
    withdrawStatus.id = 'lp-withdraw-status';
    withdrawStatus.setAttribute('role', 'status');
    withdrawStatus.setAttribute('aria-live', 'polite');
    form.appendChild(withdrawStatus);

    estimateBtn.addEventListener('click', () => void this.handleWithdrawEstimate());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.handleWithdraw();
    });

    section.appendChild(form);
    return section;
  }

  private async handleWithdrawEstimate(): Promise<void> {
    if (!this.pool) return;
    const shares = (this.container.querySelector('#lp-withdraw-shares') as HTMLInputElement).value.trim();
    const preview = this.container.querySelector('#lp-withdraw-preview') as HTMLElement;
    const withdrawBtn = this.container.querySelector('#lp-withdraw-btn') as HTMLButtonElement;
    const status = this.container.querySelector('#lp-withdraw-status') as HTMLElement;

    if (!shares) {
      status.textContent = 'Shares amount is required.';
      return;
    }

    status.textContent = 'Estimating…';
    try {
      const est = await this.callbacks.onEstimateWithdraw(this.pool.id, shares);
      preview.innerHTML = `
        <div class="result-item"><strong>Receive A:</strong> <span id="lp-west-a">${est.amountA}</span></div>
        <div class="result-item"><strong>Receive B:</strong> <span id="lp-west-b">${est.amountB}</span></div>
        <div class="result-item"><strong>Share Price:</strong> <span id="lp-west-price">${est.sharePrice}</span></div>
        <div class="result-item"><strong>Price Impact:</strong> <span id="lp-west-impact">${est.priceImpact}%</span></div>
      `;
      preview.hidden = false;
      withdrawBtn.disabled = false;
      status.textContent = '';
    } catch (err) {
      status.textContent = `Estimate failed: ${err instanceof Error ? err.message : String(err)}`;
      preview.hidden = true;
      withdrawBtn.disabled = true;
    }
  }

  private async handleWithdraw(): Promise<void> {
    if (!this.pool) return;
    const shares = (this.container.querySelector('#lp-withdraw-shares') as HTMLInputElement).value.trim();
    const status = this.container.querySelector('#lp-withdraw-status') as HTMLElement;
    const withdrawBtn = this.container.querySelector('#lp-withdraw-btn') as HTMLButtonElement;

    withdrawBtn.disabled = true;
    withdrawBtn.textContent = 'Withdrawing…';
    status.textContent = '';

    try {
      const txHash = await this.callbacks.onWithdraw(this.pool.id, shares);
      status.textContent = `Withdrawal successful! Tx: ${txHash}`;
      await this.renderAnalytics(this.pool.id);
      await this.renderUserShares(this.pool.id);
    } catch (err) {
      status.textContent = `Withdrawal failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      withdrawBtn.disabled = false;
      withdrawBtn.textContent = 'Withdraw';
    }
  }

  /* ================================================================ */
  /*  Impermanent loss estimator                                      */
  /* ================================================================ */

  private handleILEstimate(): void {
    const initialPrice = (this.container.querySelector('#lp-il-initial-price') as HTMLInputElement).value.trim();
    const currentPrice = (this.container.querySelector('#lp-il-current-price') as HTMLInputElement).value.trim();
    const result = this.container.querySelector('#lp-il-result') as HTMLElement;

    if (!initialPrice || !currentPrice) {
      result.textContent = 'Both prices are required.';
      return;
    }

    try {
      const ilPct = this.callbacks.onCalculateIL(initialPrice, currentPrice);
      result.innerHTML = `<strong>Estimated Impermanent Loss:</strong> <span id="lp-il-value">${ilPct}%</span>`;
    } catch (err) {
      result.textContent = `IL calculation failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  /* ================================================================ */
  /*  Section visibility helpers                                      */
  /* ================================================================ */

  private showPoolSections(): void {
    const ids = ['lp-analytics-section', 'lp-deposit-section', 'lp-withdraw-section'];
    for (const id of ids) {
      const el = this.container.querySelector(`#${id}`) as HTMLElement | null;
      if (el) el.hidden = false;
    }
  }

  private hidePoolSections(): void {
    this.pool = null;
    const ids = ['lp-pool-info', 'lp-analytics-section', 'lp-deposit-section', 'lp-withdraw-section'];
    for (const id of ids) {
      const el = this.container.querySelector(`#${id}`) as HTMLElement | null;
      if (el) el.hidden = true;
    }
  }

  /* ================================================================ */
  /*  Shared field builder (mirrors WalletTxPanel pattern)            */
  /* ================================================================ */

  private buildField(opts: {
    id: string;
    label: string;
    type: string;
    placeholder?: string;
    required?: boolean;
  }): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'form-field';
    const label = document.createElement('label');
    label.htmlFor = opts.id;
    label.textContent = opts.label;
    const input = document.createElement('input');
    input.type = opts.type;
    input.id = opts.id;
    input.name = opts.id;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.required) input.required = true;
    wrapper.appendChild(label);
    wrapper.appendChild(input);
    return wrapper;
  }
}
