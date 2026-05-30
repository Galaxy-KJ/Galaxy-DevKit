/**
 * @jest-environment jest-environment-jsdom
 */

import {
  SmartSwapClient,
  buildConditionTypeScVal,
  formatConditionType,
  parseConditionType,
} from '../services/smart-swap.client';
import { SmartSwapPanel, buildConditionTypeFromForm } from '../panels/smart-swap';

function makeContainer(): HTMLDivElement {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

describe('SmartSwapClient helpers', () => {
  it('maps all condition type variants for display', () => {
    expect(formatConditionType({ kind: 'PriceAbove', value: 1200 })).toBe('above 1200');
    expect(formatConditionType({ kind: 'PercentageIncrease', value: 5 })).toBe('+5%');
    expect(buildConditionTypeFromForm('TargetPrice', 999)).toEqual({ kind: 'TargetPrice', value: 999 });
  });

  it('builds Soroban ScVal tags for each condition type', () => {
    const above = buildConditionTypeScVal({ kind: 'PriceAbove', value: 100 });
    expect(above.switch().name).toBe('scvVec');

    const decrease = buildConditionTypeScVal({ kind: 'PercentageDecrease', value: 3 });
    expect(decrease.switch().name).toBe('scvVec');
  });

  it('parses contract condition type tuples', () => {
    expect(parseConditionType(['PriceBelow', 500])).toEqual({ kind: 'PriceBelow', value: 500 });
    expect(parseConditionType({ PercentageIncrease: 10 })).toEqual({
      kind: 'PercentageIncrease',
      value: 10,
    });
  });

  it('validates create input', async () => {
    const client = new SmartSwapClient();
    await expect(
      client.createSwapCondition({
        owner: '',
        sourceAsset: 'XLM',
        destinationAsset: 'USDC',
        conditionType: { kind: 'PriceAbove', value: 1 },
        amountToSwap: 1,
        minAmountOut: 1,
        maxSlippage: 50,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).rejects.toThrow('owner is required');
  });
});

describe('SmartSwapPanel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('creates a condition and refreshes active list', async () => {
    const container = makeContainer();
    const mockClient = {
      setContractId: jest.fn(),
      getContractId: jest.fn().mockReturnValue('CCONTRACT'),
      createSwapCondition: jest.fn().mockResolvedValue({ xdr: 'AAAA' }),
      executeSwapCondition: jest.fn(),
      cancelCondition: jest.fn(),
      getActiveConditions: jest.fn().mockResolvedValue([
        {
          id: 1,
          owner: 'GTEST',
          sourceAsset: 'XLM',
          destinationAsset: 'USDC',
          conditionType: { kind: 'PriceAbove', value: 1000 },
          amountToSwap: 100,
          minAmountOut: 95,
          maxSlippage: 50,
          referencePrice: 0,
          createdAt: 1,
          expiresAt: 999,
          status: 'Active',
        },
      ]),
      getExecutionHistory: jest.fn(),
    };

    new SmartSwapPanel(container, mockClient);

    (container.querySelector('#smart-swap-owner') as HTMLInputElement).value = 'GTEST';
    (container.querySelector('#smart-swap-create') as HTMLButtonElement).click();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockClient.createSwapCondition).toHaveBeenCalled();
    expect(mockClient.getActiveConditions).toHaveBeenCalledWith('GTEST');
    expect((container.querySelector('#smart-swap-tx') as HTMLElement).textContent).toContain('AAAA');
  });

  it('loads execution history for a condition id', async () => {
    const container = makeContainer();
    const mockClient = {
      setContractId: jest.fn(),
      getContractId: jest.fn().mockReturnValue('CCONTRACT'),
      createSwapCondition: jest.fn(),
      executeSwapCondition: jest.fn(),
      cancelCondition: jest.fn(),
      getActiveConditions: jest.fn(),
      getExecutionHistory: jest.fn().mockResolvedValue([
        {
          conditionId: 2,
          executedAt: 100,
          actualAmountOut: 95,
          priceAtExecution: 1000,
          transactionHash: 'abc',
        },
      ]),
    };

    new SmartSwapPanel(container, mockClient);

    (container.querySelector('#smart-swap-owner') as HTMLInputElement).value = 'GTEST';
    (container.querySelector('#smart-swap-condition-id') as HTMLInputElement).value = '2';
    (container.querySelector('#smart-swap-history') as HTMLButtonElement).click();

    await Promise.resolve();
    await Promise.resolve();

    expect(mockClient.getExecutionHistory).toHaveBeenCalledWith(2, 'GTEST');
    expect((container.querySelector('#smart-swap-history-out') as HTMLElement).textContent).toContain('abc');
  });
});
