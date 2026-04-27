/**
 * @jest-environment jest-environment-jsdom
 */

import { BlendPanel, calculateBlendHealth, getHealthTone } from '../panels/blend';

function makeContainer(): HTMLDivElement {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

describe('BlendPanel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('calculates health factor with debt edge cases', () => {
    const infinite = calculateBlendHealth({ collateralValue: '10', debtValue: '0' });
    expect(infinite.healthFactor).toBe(Infinity);

    const normal = calculateBlendHealth({ collateralValue: '15', debtValue: '10' });
    expect(normal.healthFactor).toBeCloseTo(1.5);
    expect(getHealthTone(1.51)).toBe('green');
    expect(getHealthTone(1.3)).toBe('yellow');
    expect(getHealthTone(1.1)).toBe('red');
  });

  it('refreshes position and renders health tone', async () => {
    const container = makeContainer();
    const mockClient = {
      getPosition: jest.fn().mockResolvedValue({ collateralValue: '300', debtValue: '100' }),
      borrow: jest.fn(),
      repay: jest.fn(),
    };

    new BlendPanel(container, mockClient);

    (container.querySelector('#blend-wallet') as HTMLInputElement).value = 'GTEST';
    (container.querySelector('#blend-refresh') as HTMLButtonElement).click();

    await Promise.resolve();
    await Promise.resolve();

    const health = container.querySelector('#blend-health') as HTMLElement;
    expect(health.className).toContain('blend-health-green');
    expect((container.querySelector('#blend-health-value') as HTMLElement).textContent).toBe('3.0000');
  });

  it('initiates borrow and refreshes health factor afterwards', async () => {
    const container = makeContainer();
    const mockClient = {
      getPosition: jest.fn()
        .mockResolvedValueOnce({ collateralValue: '120', debtValue: '100' })
        .mockResolvedValueOnce({ collateralValue: '140', debtValue: '100' }),
      borrow: jest.fn().mockResolvedValue({ xdr: 'AAAA' }),
      repay: jest.fn(),
    };

    new BlendPanel(container, mockClient);

    (container.querySelector('#blend-wallet') as HTMLInputElement).value = 'GTEST';
    (container.querySelector('#blend-amount') as HTMLInputElement).value = '10';
    (container.querySelector('#blend-borrow') as HTMLButtonElement).click();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockClient.borrow).toHaveBeenCalled();
    expect(mockClient.getPosition).toHaveBeenCalledTimes(1);
    expect((container.querySelector('#blend-tx') as HTMLElement).textContent).toContain('AAAA');
  });
});
