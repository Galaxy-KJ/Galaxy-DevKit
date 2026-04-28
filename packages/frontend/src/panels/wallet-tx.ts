/**
 * Transaction signing and submission panel.
 *
 * Implements the end-to-end payment flow:
 *   build → simulate (display payload) → sign (WebAuthn) → submit → confirm
 *
 * The simulation result is rendered before the user commits so they can
 * inspect fee, auth entries, and the destination before authorizing.
 */

import { TxBuilderClient, type PaymentParams } from '../services/tx-builder.client';
import { TxTrackerService, TrackedTransaction } from '../services/tx-tracker';

export interface WalletTxCallbacks {
  /**
   * Signs the simulated transaction via smart-wallet __check_auth and returns
   * the signed fee-less XDR ready for submission.
   */
  onSign: (walletAddress: string, unsignedXdr: string, credentialId: string) => Promise<string>;
  /** Submits the signed XDR and returns the transaction hash */
  onSubmit: (signedXdr: string) => Promise<string>;
  /** Called after successful submission so the parent can refresh balances */
  onConfirmed?: (txHash: string) => void;
}

export interface WalletTxPanelOptions {
  rpcUrl: string;
  network?: string;
  txTracker?: TxTrackerService;
}

export class WalletTxPanel {
  private container: HTMLElement;
  private callbacks: WalletTxCallbacks;
  private txBuilder: TxBuilderClient;
  private txTracker?: TxTrackerService;

  constructor(
    container: HTMLElement,
    options: WalletTxPanelOptions,
    callbacks: WalletTxCallbacks
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.txBuilder = new TxBuilderClient(options.rpcUrl, options.network);
    this.txTracker = options.txTracker;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Transaction builder');

    const heading = document.createElement('h2');
    heading.id = 'tx-panel-heading';
    heading.textContent = 'Send Transaction';
    this.container.appendChild(heading);

    this.container.appendChild(this.buildForm());
  }

  private buildForm(): HTMLFormElement {
    const form = document.createElement('form');
    form.id = 'tx-form';
    form.setAttribute('aria-labelledby', 'tx-panel-heading');
    form.setAttribute('novalidate', '');

    form.appendChild(this.buildField({ id: 'tx-wallet-address', label: 'Wallet Address (C…)', type: 'text', placeholder: 'CContract…', required: true }));
    form.appendChild(this.buildField({ id: 'tx-credential-id', label: 'WebAuthn Credential ID', type: 'text', placeholder: 'base64url credential id', required: true }));
    form.appendChild(this.buildField({ id: 'tx-destination', label: 'Destination Address (G…)', type: 'text', placeholder: 'GXXXXXXXX…', required: true }));
    form.appendChild(this.buildField({ id: 'tx-amount', label: 'Amount (XLM)', type: 'number', placeholder: '10.0', required: true }));
    form.appendChild(this.buildField({ id: 'tx-memo', label: 'Memo (optional)', type: 'text', placeholder: 'Optional memo text' }));

    // Simulate preview section — shown before user authorizes
    const previewSection = document.createElement('section');
    previewSection.id = 'tx-preview-section';
    previewSection.hidden = true;
    previewSection.setAttribute('aria-label', 'Transaction simulation preview');
    const previewHeading = document.createElement('h3');
    previewHeading.textContent = 'Simulation Preview';
    previewSection.appendChild(previewHeading);
    const previewPre = document.createElement('pre');
    previewPre.id = 'tx-preview-pre';
    previewPre.setAttribute('aria-label', 'Simulated transaction details');
    previewSection.appendChild(previewPre);
    form.appendChild(previewSection);

    // Status area
    const status = document.createElement('p');
    status.id = 'tx-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    form.appendChild(status);

    // Action buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'btn-row';

    const simulateBtn = document.createElement('button');
    simulateBtn.type = 'button';
    simulateBtn.id = 'tx-simulate-btn';
    simulateBtn.textContent = 'Simulate';
    simulateBtn.setAttribute('aria-describedby', 'tx-status');

    const signSubmitBtn = document.createElement('button');
    signSubmitBtn.type = 'submit';
    signSubmitBtn.id = 'tx-sign-submit-btn';
    signSubmitBtn.textContent = 'Sign & Submit';
    signSubmitBtn.disabled = true;
    signSubmitBtn.setAttribute('aria-describedby', 'tx-status');

    btnRow.appendChild(simulateBtn);
    btnRow.appendChild(signSubmitBtn);
    form.appendChild(btnRow);

    // Confirmation area
    const confirmation = document.createElement('div');
    confirmation.id = 'tx-confirmation';
    confirmation.hidden = true;
    confirmation.setAttribute('role', 'alert');
    confirmation.setAttribute('aria-live', 'assertive');
    form.appendChild(confirmation);

    // State used across simulate → sign flow
    let pendingSimResult: Awaited<ReturnType<TxBuilderClient['buildAndSimulate']>> | null = null;

    const collectParams = (): PaymentParams | null => {
      const walletAddress = (form.querySelector('#tx-wallet-address') as HTMLInputElement).value.trim();
      const destination = (form.querySelector('#tx-destination') as HTMLInputElement).value.trim();
      const amount = (form.querySelector('#tx-amount') as HTMLInputElement).value.trim();
      const memo = (form.querySelector('#tx-memo') as HTMLInputElement).value.trim();
      if (!walletAddress || !destination || !amount) return null;
      return { walletAddress, destination, amount, memo: memo || undefined };
    };

    simulateBtn.addEventListener('click', async () => {
      const params = collectParams();
      if (!params) {
        status.textContent = 'Wallet address, destination, and amount are required.';
        return;
      }

      simulateBtn.disabled = true;
      simulateBtn.textContent = 'Simulating…';
      signSubmitBtn.disabled = true;
      previewSection.hidden = true;
      status.textContent = '';
      confirmation.hidden = true;
      pendingSimResult = null;

      try {
        pendingSimResult = await this.txBuilder.buildAndSimulate(params);
        previewPre.textContent = JSON.stringify(
          {
            resourceFee: `${pendingSimResult.resourceFee} stroops (Soroban resource component only)`,
            authEntries: pendingSimResult.authEntryCount,
            destination: params.destination,
            amount: `${params.amount} XLM`,
            memo: params.memo ?? '(none)',
          },
          null,
          2
        );
        previewSection.hidden = false;
        signSubmitBtn.disabled = false;
        status.textContent = 'Review simulation above, then click Sign & Submit.';
      } catch (err) {
        status.textContent = `Simulation failed: ${err instanceof Error ? err.message : String(err)}`;
      } finally {
        simulateBtn.disabled = false;
        simulateBtn.textContent = 'Simulate';
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!pendingSimResult) {
        status.textContent = 'Run Simulate first.';
        return;
      }

      const walletAddress = (form.querySelector('#tx-wallet-address') as HTMLInputElement).value.trim();
      const credentialId = (form.querySelector('#tx-credential-id') as HTMLInputElement).value.trim();
      if (!credentialId) {
        status.textContent = 'Credential ID is required for signing.';
        return;
      }

      signSubmitBtn.disabled = true;
      signSubmitBtn.textContent = 'Signing…';
      status.textContent = '';
      let trackerEntry: TrackedTransaction | null = null;
      let signedXdr = '';

      try {
        const unsignedXdr = this.txBuilder.assembleFromSimulation(
          pendingSimResult.transaction,
          pendingSimResult.raw
        );

        const destination = (form.querySelector('#tx-destination') as HTMLInputElement).value.trim();
        const amount = (form.querySelector('#tx-amount') as HTMLInputElement).value.trim();
        const memo = (form.querySelector('#tx-memo') as HTMLInputElement).value.trim();
        trackerEntry = this.txTracker?.createPending({
          walletAddress,
          destination,
          amount,
          memo: memo || undefined,
          unsignedXdr,
          network: 'testnet',
          simulationAuthEntryCount: pendingSimResult.authEntryCount,
          simulationResourceFee: pendingSimResult.resourceFee,
        }) ?? null;

        signedXdr = await this.callbacks.onSign(walletAddress, unsignedXdr, credentialId);

        signSubmitBtn.textContent = 'Submitting…';
        const txHash = await this.callbacks.onSubmit(signedXdr);
        if (trackerEntry) {
          this.txTracker?.markSuccess(trackerEntry.id, txHash, signedXdr);
        }

        confirmation.hidden = false;
        confirmation.innerHTML = `
          <strong>Transaction submitted!</strong>
          <br>Hash: <code>${txHash}</code>
        `;
        status.textContent = '';
        previewSection.hidden = true;
        signSubmitBtn.disabled = true;
        pendingSimResult = null;
        form.reset();

        this.callbacks.onConfirmed?.(txHash);
      } catch (err) {
        if (trackerEntry) {
          this.txTracker?.markFailed(
            trackerEntry.id,
            err instanceof Error ? err.message : String(err),
            signedXdr || undefined
          );
        }
        status.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
        signSubmitBtn.disabled = false;
        signSubmitBtn.textContent = 'Sign & Submit';
      }
    });

    return form;
  }

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
