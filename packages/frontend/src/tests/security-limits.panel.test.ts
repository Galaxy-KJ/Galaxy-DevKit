/**
 * @jest-environment jest-environment-jsdom
 */

import { SecurityLimitsPanel } from '../panels/security-limits';
import { SecurityLimitsClient } from '../services/security-limits.client';

async function flushUi(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('SecurityLimitsPanel', () => {
  let container: HTMLDivElement;
  let client: SecurityLimitsClient;

  beforeEach(async () => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);

    client = new SecurityLimitsClient('security-limits-panel-test');
    await client.clearAll();
  });

  afterEach(() => {
    container.remove();
  });

  it('creates a limit and refreshes limits list', async () => {
    new SecurityLimitsPanel(container, client);

    (container.querySelector('#sl-owner') as HTMLInputElement).value = 'GOWNER';
    (container.querySelector('#sl-asset') as HTMLInputElement).value = 'XLM';
    (container.querySelector('#sl-max-amount') as HTMLInputElement).value = '100';

    (container.querySelector('#sl-create-limit') as HTMLButtonElement).click();
    await flushUi();
    await flushUi();

    expect((container.querySelector('#sl-limits') as HTMLElement).textContent).toContain('"asset": "XLM"');
  });

  it('checks and records transactions', async () => {
    await client.createSecurityLimit({
      owner: 'GOWNER',
      asset: 'XLM',
      limitType: 'Daily',
      maxAmount: 100,
    });

    new SecurityLimitsPanel(container, client);

    (container.querySelector('#sl-owner') as HTMLInputElement).value = 'GOWNER';
    (container.querySelector('#sl-check-asset') as HTMLInputElement).value = 'XLM';
    (container.querySelector('#sl-check-amount') as HTMLInputElement).value = '20';

    (container.querySelector('#sl-check') as HTMLButtonElement).click();
    await flushUi();

    expect((container.querySelector('#sl-check-result') as HTMLElement).textContent).toContain('Allowed');

    (container.querySelector('#sl-record') as HTMLButtonElement).click();
    await flushUi();
    await flushUi();

    expect((container.querySelector('#sl-records') as HTMLElement).textContent).toContain('mock-tx');
  });
});
